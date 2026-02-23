package config

import (
	"os"
	"strconv"
)

type Config struct {
	AppAddr       string
	DBPath        string
	JWTSecret     string
	EncKey        string
	WorkerToken   string
	AccessTTLMin  int
	RefreshTTLDays int
	AdminUser     string
	AdminPassword string
}

func getEnv(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return v
}

func getEnvInt(key string, fallback int) int {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v <= 0 {
		return fallback
	}
	return v
}

func Load() Config {
	return Config{
		AppAddr:        getEnv("APP_ADDR", ":8080"),
		DBPath:         getEnv("DB_PATH", "./data/pusaka.db"),
		JWTSecret:      getEnv("JWT_SECRET", "dev-jwt-secret-change-me"),
		EncKey:         getEnv("ENC_KEY", "0123456789abcdef0123456789abcdef"),
		WorkerToken:    getEnv("WORKER_TOKEN", "dev-worker-token"),
		AccessTTLMin:   getEnvInt("ACCESS_TTL_MIN", 60),
		RefreshTTLDays: getEnvInt("REFRESH_TTL_DAYS", 14),
		AdminUser:      getEnv("ADMIN_USER", "admin"),
		AdminPassword:  getEnv("ADMIN_PASSWORD", "admin123"),
	}
}
