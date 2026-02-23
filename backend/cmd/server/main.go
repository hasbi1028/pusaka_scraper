package main

import (
	"database/sql"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"pusaka/backend/internal/auth"
	"pusaka/backend/internal/config"
	"pusaka/backend/internal/db"
	"pusaka/backend/internal/handlers"
	"pusaka/backend/internal/middleware"
	"pusaka/backend/internal/worker"
)

func ensureAdmin(dbx *sql.DB, username, password string) error {
	var count int
	if err := dbx.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}
	_, err = dbx.Exec(`INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, 'admin')`, auth.NewID(), username, hash)
	return err
}

func main() {
	cfg := config.Load()
	dbx, err := db.Open(cfg.DBPath)
	if err != nil {
		log.Fatal(err)
	}
	defer dbx.Close()

	if err := db.Migrate(dbx); err != nil {
		log.Fatal(err)
	}
	if err := ensureAdmin(dbx, cfg.AdminUser, cfg.AdminPassword); err != nil {
		log.Fatal(err)
	}

	encKey := []byte(cfg.EncKey)
	authH := &handlers.AuthHandler{DB: dbx, Cfg: cfg}
	jobsH := &handlers.JobsHandler{DB: dbx, EncKey: encKey}
	targetsH := &handlers.TargetsHandler{DB: dbx, EncKey: encKey}
	workerH := &worker.Handler{DB: dbx, EncKey: encKey, MaxRetry: 3}

	app := fiber.New()
	app.Use(cors.New())
	app.Get("/health", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"status": "ok"}) })

	api := app.Group("/api/v1")
	api.Post("/auth/login", authH.Login)
	api.Post("/auth/refresh", authH.Refresh)
	api.Post("/auth/logout", authH.Logout)

	admin := api.Group("/admin", middleware.RequireJWT(cfg.JWTSecret))
	admin.Get("/jobs", jobsH.List)
	admin.Get("/jobs/stats", jobsH.Stats)
	admin.Get("/jobs/:id", jobsH.Detail)
	admin.Post("/jobs", jobsH.Create)
	admin.Post("/jobs/:id/retry", jobsH.Retry)
	admin.Get("/targets", targetsH.List)
	admin.Get("/targets/:id", targetsH.Detail)
	admin.Post("/targets", targetsH.Create)
	admin.Put("/targets/:id", targetsH.Update)
	admin.Delete("/targets/:id", targetsH.Delete)
	admin.Post("/targets/:id/enqueue", targetsH.Enqueue)

	workerApi := api.Group("/worker", middleware.RequireWorkerToken(cfg.WorkerToken))
	workerApi.Post("/jobs/claim", workerH.Claim)
	workerApi.Post("/jobs/:id/heartbeat", workerH.Heartbeat)
	workerApi.Post("/jobs/:id/success", workerH.Success)
	workerApi.Post("/jobs/:id/fail", workerH.Fail)

	worker.StartStaleRecoveryLoop(dbx, 30_000, 5*time.Second)

	log.Printf("backend running on %s", cfg.AppAddr)
	if err := app.Listen(cfg.AppAddr); err != nil {
		log.Fatal(err)
	}
}
