package handlers

import (
	"database/sql"
	"encoding/json"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"pusaka/backend/internal/auth"
)

type TargetsHandler struct {
	DB     *sql.DB
	EncKey []byte
}

type createTargetReq struct {
	NIP      string `json:"nip"`
	Nama     string `json:"nama"`
	Password string `json:"password"`
}

type updateTargetReq struct {
	NIP      string `json:"nip"`
	Nama     string `json:"nama"`
	Password string `json:"password"`
}

func parsePageInt(v string, fallback int) int {
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func (h *TargetsHandler) List(c *fiber.Ctx) error {
	q := strings.TrimSpace(c.Query("q"))
	page := parsePageInt(c.Query("page"), 1)
	limit := parsePageInt(c.Query("limit"), 20)
	if limit > 200 {
		limit = 200
	}
	offset := (page - 1) * limit

	where := []string{"1=1"}
	args := []any{}
	if q != "" {
		where = append(where, "(nip LIKE ? OR nama LIKE ?)")
		args = append(args, "%"+q+"%", "%"+q+"%")
	}

	query := `SELECT id, nip, nama, created_at, updated_at FROM scrape_targets WHERE ` + strings.Join(where, " AND ") + ` ORDER BY created_at DESC LIMIT ? OFFSET ?`
	args = append(args, limit, offset)

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to query targets"})
	}
	defer rows.Close()

	items := make([]fiber.Map, 0)
	for rows.Next() {
		var id, nip, nama string
		var createdAt, updatedAt sql.NullString
		if err := rows.Scan(&id, &nip, &nama, &createdAt, &updatedAt); err != nil {
			continue
		}
		items = append(items, fiber.Map{
			"id": id,
			"nip": nip,
			"nama": nama,
			"password_masked": "********",
			"created_at": createdAt.String,
			"updated_at": updatedAt.String,
		})
	}

	return c.JSON(fiber.Map{"items": items, "page": page, "limit": limit})
}

func (h *TargetsHandler) Detail(c *fiber.Ctx) error {
	id := strings.TrimSpace(c.Params("id"))
	var nip, nama string
	var createdAt, updatedAt sql.NullString
	err := h.DB.QueryRow(`SELECT nip, nama, created_at, updated_at FROM scrape_targets WHERE id = ?`, id).Scan(&nip, &nama, &createdAt, &updatedAt)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "target not found"})
	}

	return c.JSON(fiber.Map{
		"id": id,
		"nip": nip,
		"nama": nama,
		"password_masked": "********",
		"created_at": createdAt.String,
		"updated_at": updatedAt.String,
	})
}

func (h *TargetsHandler) Create(c *fiber.Ctx) error {
	var req createTargetReq
	if err := json.Unmarshal(c.Body(), &req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}

	req.NIP = strings.TrimSpace(req.NIP)
	req.Nama = strings.TrimSpace(req.Nama)
	if req.NIP == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "nip and password are required"})
	}

	encPass, err := auth.EncryptString(h.EncKey, req.Password)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to encrypt password"})
	}

	id := auth.NewID()
	_, err = h.DB.Exec(`INSERT INTO scrape_targets (id, nip, nama, password_encrypted) VALUES (?, ?, ?, ?)`, id, req.NIP, req.Nama, encPass)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "nip already exists"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create target"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"id": id})
}

func (h *TargetsHandler) Update(c *fiber.Ctx) error {
	id := strings.TrimSpace(c.Params("id"))
	var req updateTargetReq
	if err := json.Unmarshal(c.Body(), &req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}

	req.NIP = strings.TrimSpace(req.NIP)
	req.Nama = strings.TrimSpace(req.Nama)
	if req.NIP == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "nip is required"})
	}

	if strings.TrimSpace(req.Password) == "" {
		res, err := h.DB.Exec(`UPDATE scrape_targets SET nip=?, nama=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, req.NIP, req.Nama, id)
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "unique") {
				return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "nip already exists"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update target"})
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "target not found"})
		}
		return c.SendStatus(fiber.StatusNoContent)
	}

	encPass, err := auth.EncryptString(h.EncKey, req.Password)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to encrypt password"})
	}

	res, err := h.DB.Exec(`UPDATE scrape_targets SET nip=?, nama=?, password_encrypted=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, req.NIP, req.Nama, encPass, id)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "nip already exists"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update target"})
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "target not found"})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func (h *TargetsHandler) Delete(c *fiber.Ctx) error {
	id := strings.TrimSpace(c.Params("id"))
	res, err := h.DB.Exec(`DELETE FROM scrape_targets WHERE id = ?`, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete target"})
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "target not found"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *TargetsHandler) Enqueue(c *fiber.Ctx) error {
	id := strings.TrimSpace(c.Params("id"))
	var nip, nama, encPass string
	err := h.DB.QueryRow(`SELECT nip, nama, password_encrypted FROM scrape_targets WHERE id = ?`, id).Scan(&nip, &nama, &encPass)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "target not found"})
	}

	jobID := auth.NewID()
	_, err = h.DB.Exec(
		`INSERT INTO jobs (id, nip, nama, password_encrypted, status, retry) VALUES (?, ?, ?, ?, 'pending', 0)`,
		jobID, nip, nama, encPass,
	)
	if err != nil {
		if isUniqueConstraintErr(err) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "nip has active job"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to enqueue job"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"job_id": jobID})
}
