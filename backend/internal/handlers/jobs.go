package handlers

import (
	"database/sql"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"pusaka/backend/internal/auth"
)

type JobsHandler struct {
	DB     *sql.DB
	EncKey []byte
}

type createJobReq struct {
	NIP      string `json:"nip"`
	Nama     string `json:"nama"`
	Password string `json:"password"`
}

func parsePage(v string, fallback int) int {
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func (h *JobsHandler) Create(c *fiber.Ctx) error {
	var req createJobReq
	if err := json.Unmarshal(c.Body(), &req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	req.NIP = strings.TrimSpace(req.NIP)
	req.Nama = strings.TrimSpace(req.Nama)
	if req.NIP == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "nip and password required"})
	}
	encPass, err := auth.EncryptString(h.EncKey, req.Password)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to encrypt password"})
	}
	id := auth.NewID()
	if _, err := h.DB.Exec(
		`INSERT INTO jobs (id, nip, nama, password_encrypted, status, retry) VALUES (?, ?, ?, ?, 'pending', 0)`,
		id, req.NIP, req.Nama, encPass,
	); err != nil {
		if isUniqueConstraintErr(err) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "nip has active job"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create job"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"id": id})
}

func (h *JobsHandler) List(c *fiber.Ctx) error {
	status := strings.TrimSpace(c.Query("status"))
	nip := strings.TrimSpace(c.Query("nip"))
	page := parsePage(c.Query("page"), 1)
	limit := parsePage(c.Query("limit"), 20)
	if limit > 200 {
		limit = 200
	}
	offset := (page - 1) * limit

	where := []string{"1=1"}
	args := []any{}
	if status != "" {
		where = append(where, "status = ?")
		args = append(args, status)
	}
	if nip != "" {
		where = append(where, "nip LIKE ?")
		args = append(args, "%"+nip+"%")
	}
	q := `SELECT id, nip, nama, tanggal, jam_masuk, jam_pulang, status, retry, error, progress_age_ms, duration_ms, claimed_by, claimed_at, heartbeat_at, created_at, updated_at
	      FROM jobs WHERE ` + strings.Join(where, " AND ") + ` ORDER BY created_at DESC LIMIT ? OFFSET ?`
	args = append(args, limit, offset)

	rows, err := h.DB.Query(q, args...)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to query jobs"})
	}
	defer rows.Close()

	items := make([]fiber.Map, 0)
	for rows.Next() {
		var id, nipV, nama, tanggal, jamMasuk, jamPulang, statusV, errMsg, claimedBy string
		var retry int
		var progressAge, duration int64
		var claimedAt, hbAt, createdAt, updatedAt sql.NullString
		if err := rows.Scan(&id, &nipV, &nama, &tanggal, &jamMasuk, &jamPulang, &statusV, &retry, &errMsg, &progressAge, &duration, &claimedBy, &claimedAt, &hbAt, &createdAt, &updatedAt); err != nil {
			continue
		}
		items = append(items, fiber.Map{
			"id": id, "nip": nipV, "nama": nama, "tanggal": tanggal,
			"jam_masuk": jamMasuk, "jam_pulang": jamPulang, "status": statusV,
			"retry": retry, "error": errMsg, "progress_age_ms": progressAge,
			"duration_ms": duration, "claimed_by": claimedBy,
			"claimed_at": claimedAt.String, "heartbeat_at": hbAt.String,
			"created_at": createdAt.String, "updated_at": updatedAt.String,
		})
	}

	return c.JSON(fiber.Map{"items": items, "page": page, "limit": limit})
}

func (h *JobsHandler) Detail(c *fiber.Ctx) error {
	id := c.Params("id")
	var nipV, nama, tanggal, jamMasuk, jamPulang, statusV, errMsg, claimedBy string
	var retry int
	var progressAge, duration int64
	var claimedAt, hbAt, createdAt, updatedAt sql.NullString
	err := h.DB.QueryRow(
		`SELECT id, nip, nama, tanggal, jam_masuk, jam_pulang, status, retry, error, progress_age_ms, duration_ms, claimed_by, claimed_at, heartbeat_at, created_at, updated_at FROM jobs WHERE id = ?`,
		id,
	).Scan(&id, &nipV, &nama, &tanggal, &jamMasuk, &jamPulang, &statusV, &retry, &errMsg, &progressAge, &duration, &claimedBy, &claimedAt, &hbAt, &createdAt, &updatedAt)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "job not found"})
	}
	return c.JSON(fiber.Map{
		"id": id, "nip": nipV, "nama": nama, "tanggal": tanggal,
		"jam_masuk": jamMasuk, "jam_pulang": jamPulang, "status": statusV,
		"retry": retry, "error": errMsg, "progress_age_ms": progressAge,
		"duration_ms": duration, "claimed_by": claimedBy,
		"claimed_at": claimedAt.String, "heartbeat_at": hbAt.String,
		"created_at": createdAt.String, "updated_at": updatedAt.String,
	})
}

func (h *JobsHandler) Retry(c *fiber.Ctx) error {
	id := c.Params("id")
	res, err := h.DB.Exec(`UPDATE jobs SET status='pending', error='', claimed_by='', claimed_at=NULL, heartbeat_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND status = 'failed'`, id)
	if err != nil {
		if isUniqueConstraintErr(err) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "nip has active job"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to retry job"})
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "job not found or not failed"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *JobsHandler) Stats(c *fiber.Ctx) error {
	statuses := []string{"pending", "running", "success", "failed"}
	out := fiber.Map{}
	for _, s := range statuses {
		var n int
		if err := h.DB.QueryRow(`SELECT COUNT(*) FROM jobs WHERE status = ?`, s).Scan(&n); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to read stats"})
		}
		out[s] = n
	}
	var total int
	_ = h.DB.QueryRow(`SELECT COUNT(*) FROM jobs`).Scan(&total)
	out["total"] = total
	return c.JSON(out)
}

func MarkStaleJobs(db *sql.DB, staleMS int64) error {
	threshold := time.Now().Add(-time.Duration(staleMS) * time.Millisecond)
	_, err := db.Exec(`
		UPDATE jobs
		SET status='failed', retry=retry+1, error='Recovered from stale worker timeout', claimed_by='', claimed_at=NULL, heartbeat_at=NULL, updated_at=CURRENT_TIMESTAMP
		WHERE status='running' AND (heartbeat_at IS NULL OR heartbeat_at < ?)
	`, threshold)
	return err
}
