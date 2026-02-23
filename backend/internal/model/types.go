package model

import "time"

type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
}

type Job struct {
	ID            string     `json:"id"`
	NIP           string     `json:"nip"`
	Nama          string     `json:"nama"`
	PasswordEnc   string     `json:"-"`
	Tanggal       string     `json:"tanggal"`
	JamMasuk      string     `json:"jam_masuk"`
	JamPulang     string     `json:"jam_pulang"`
	Status        string     `json:"status"`
	Retry         int        `json:"retry"`
	Error         string     `json:"error"`
	ProgressAgeMS int64      `json:"progress_age_ms"`
	DurationMS    int64      `json:"duration_ms"`
	ClaimedBy     string     `json:"claimed_by"`
	ClaimedAt     *time.Time `json:"claimed_at"`
	HeartbeatAt   *time.Time `json:"heartbeat_at"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}
