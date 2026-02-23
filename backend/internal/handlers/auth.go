package handlers

import (
	"database/sql"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"pusaka/backend/internal/auth"
	"pusaka/backend/internal/config"
)

type AuthHandler struct {
	DB  *sql.DB
	Cfg config.Config
}

type loginReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type refreshReq struct {
	RefreshToken string `json:"refresh_token"`
}

func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req loginReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "username and password required"})
	}

	var userID, username, passHash, role string
	err := h.DB.QueryRow(`SELECT id, username, password_hash, role FROM users WHERE username = ?`, req.Username).
		Scan(&userID, &username, &passHash, &role)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid credentials"})
	}
	if !auth.CheckPassword(passHash, req.Password) {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid credentials"})
	}

	access, err := auth.SignAccessToken(h.Cfg.JWTSecret, h.Cfg.AccessTTLMin, userID, username, role)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to sign token"})
	}
	refreshRaw, err := auth.NewOpaqueToken()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create refresh token"})
	}
	refreshHash := auth.HashToken(refreshRaw)
	expiresAt := time.Now().Add(time.Duration(h.Cfg.RefreshTTLDays) * 24 * time.Hour)
	if _, err := h.DB.Exec(
		`INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
		auth.NewID(), userID, refreshHash, expiresAt,
	); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to persist refresh token"})
	}

	return c.JSON(fiber.Map{
		"access_token":  access,
		"refresh_token": refreshRaw,
		"user": fiber.Map{
			"id":       userID,
			"username": username,
			"role":     role,
		},
	})
}

func (h *AuthHandler) Refresh(c *fiber.Ctx) error {
	var req refreshReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	if strings.TrimSpace(req.RefreshToken) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "refresh_token required"})
	}
	hash := auth.HashToken(req.RefreshToken)

	var userID string
	var expiresAt time.Time
	var revokedAt sql.NullTime
	err := h.DB.QueryRow(`SELECT user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?`, hash).
		Scan(&userID, &expiresAt, &revokedAt)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid refresh token"})
	}
	if revokedAt.Valid || time.Now().After(expiresAt) {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "refresh token expired/revoked"})
	}

	var username, role string
	if err := h.DB.QueryRow(`SELECT username, role FROM users WHERE id = ?`, userID).Scan(&username, &role); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "user not found"})
	}

	access, err := auth.SignAccessToken(h.Cfg.JWTSecret, h.Cfg.AccessTTLMin, userID, username, role)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to sign token"})
	}
	return c.JSON(fiber.Map{"access_token": access})
}

func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	var req refreshReq
	if err := c.BodyParser(&req); err == nil && strings.TrimSpace(req.RefreshToken) != "" {
		hash := auth.HashToken(req.RefreshToken)
		_, _ = h.DB.Exec(`UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ?`, hash)
	}
	return c.SendStatus(fiber.StatusNoContent)
}
