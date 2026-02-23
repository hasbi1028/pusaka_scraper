package worker

import (
	"database/sql"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"pusaka/backend/internal/auth"
)

type Handler struct {
	DB       *sql.DB
	EncKey   []byte
	MaxRetry int
}

type claimReq struct {
	WorkerID string `json:"worker_id"`
	Capacity int    `json:"capacity"`
}

type heartbeatReq struct {
	ProgressAgeMS int64 `json:"progress_age_ms"`
}

type successReq struct {
	Tanggal    string `json:"tanggal"`
	JamMasuk   string `json:"jam_masuk"`
	JamPulang  string `json:"jam_pulang"`
	DurationMS int64  `json:"duration_ms"`
}

type failReq struct {
	ErrorType   string `json:"error_type"`
	ErrorMsg    string `json:"error_message"`
	DurationMS  int64  `json:"duration_ms"`
	Retryable   bool   `json:"retryable"`
}

func (h *Handler) Claim(c *fiber.Ctx) error {
	var req claimReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	if strings.TrimSpace(req.WorkerID) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "worker_id required"})
	}
	tx, err := h.DB.Begin()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "tx begin failed"})
	}
	defer tx.Rollback()

	var id, nip, nama, encPass string
	var retry int
	err = tx.QueryRow(`
		SELECT j.id, j.nip, j.nama, j.password_encrypted, j.retry
		FROM jobs j
		WHERE j.status='pending'
		  AND NOT EXISTS (
			SELECT 1 FROM jobs r
			WHERE r.nip = j.nip AND r.status='running'
		  )
		ORDER BY j.retry ASC, j.created_at ASC
		LIMIT 1
	`).
		Scan(&id, &nip, &nama, &encPass, &retry)
	if err == sql.ErrNoRows {
		_ = tx.Commit()
		return c.JSON(fiber.Map{"job": nil})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "query pending failed"})
	}

	res, err := tx.Exec(`
		UPDATE jobs
		SET status='running', claimed_by=?, claimed_at=CURRENT_TIMESTAMP, heartbeat_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
		WHERE id=? AND status='pending'
	`, req.WorkerID, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "claim update failed"})
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		_ = tx.Commit()
		return c.JSON(fiber.Map{"job": nil})
	}
	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "tx commit failed"})
	}

	password, err := auth.DecryptString(h.EncKey, encPass)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "decrypt password failed"})
	}

	return c.JSON(fiber.Map{
		"job": fiber.Map{
			"id": id,
			"nip": nip,
			"nama": nama,
			"password": password,
			"retry": retry,
		},
	})
}

func (h *Handler) Heartbeat(c *fiber.Ctx) error {
	id := c.Params("id")
	var req heartbeatReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	_, err := h.DB.Exec(`UPDATE jobs SET heartbeat_at=CURRENT_TIMESTAMP, progress_age_ms=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='running'`, req.ProgressAgeMS, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "heartbeat update failed"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *Handler) Success(c *fiber.Ctx) error {
	id := c.Params("id")
	var req successReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	_, err := h.DB.Exec(`
		UPDATE jobs
		SET tanggal=?, jam_masuk=?, jam_pulang=?, status='success', error='', duration_ms=?, updated_at=CURRENT_TIMESTAMP
		WHERE id=?
	`, req.Tanggal, req.JamMasuk, req.JamPulang, req.DurationMS, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "success update failed"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *Handler) Fail(c *fiber.Ctx) error {
	id := c.Params("id")
	var req failReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	var retry int
	if err := h.DB.QueryRow(`SELECT retry FROM jobs WHERE id = ?`, id).Scan(&retry); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "job not found"})
	}
	retry++
	_, err := h.DB.Exec(`
		UPDATE jobs
		SET status='failed', retry=?, error=?, duration_ms=?, claimed_by='', claimed_at=NULL, heartbeat_at=NULL, updated_at=CURRENT_TIMESTAMP
		WHERE id=?
	`, retry, req.ErrorType+": "+req.ErrorMsg, req.DurationMS, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "fail update failed"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func StartStaleRecoveryLoop(db *sql.DB, staleMS int64, interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		defer ticker.Stop()
		for range ticker.C {
			_ = markStale(db, staleMS)
		}
	}()
}

func markStale(db *sql.DB, staleMS int64) error {
	threshold := time.Now().Add(-time.Duration(staleMS) * time.Millisecond)
	_, err := db.Exec(`
		UPDATE jobs
		SET status='failed', retry=retry+1, error='Recovered from stale worker timeout', claimed_by='', claimed_at=NULL, heartbeat_at=NULL, updated_at=CURRENT_TIMESTAMP
		WHERE status='running' AND (heartbeat_at IS NULL OR heartbeat_at < ?)
	`, threshold)
	return err
}
