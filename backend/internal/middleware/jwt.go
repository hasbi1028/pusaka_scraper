package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"pusaka/backend/internal/auth"
)

func RequireJWT(secret string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		h := c.Get("Authorization")
		if h == "" || !strings.HasPrefix(strings.ToLower(h), "bearer ") {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing bearer token"})
		}
		token := strings.TrimSpace(h[7:])
		claims, err := auth.ParseAccessToken(secret, token)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid token"})
		}
		c.Locals("claims", claims)
		return c.Next()
	}
}

func RequireWorkerToken(expected string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tok := c.Get("X-Worker-Token")
		if tok == "" || tok != expected {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid worker token"})
		}
		return c.Next()
	}
}
