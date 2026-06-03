package config

import (
	"os"
	"strconv"
)

// Config holds minimal configuration.
type Config struct {
	Port              int
	BindHost          string
	Env               string
	DefaultMaxResults int
}

// Load reads configuration from environment variables.
func Load() Config {
	port := 1350
	if raw := os.Getenv("AEK_PORT"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			port = parsed
		}
	}
	bindHost := os.Getenv("AEK_BIND_HOST")
	if bindHost == "" {
		bindHost = "127.0.0.1"
	}
	env := os.Getenv("AEK_ENV")
	if env == "" {
		env = "development"
	}
	return Config{Port: port, BindHost: bindHost, Env: env, DefaultMaxResults: 10}
}
