package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Port       string
	Host       string
	BasePath   string
	DisableWeb bool
	JWTSecret  string
	NodeEnv    string
	SkipAuth   bool
}

var AppConfig *Config

func getHomeDir() string {
	if home, err := os.UserHomeDir(); err == nil {
		return home
	}
	if runtime.GOOS == "windows" {
		return os.Getenv("USERPROFILE")
	}
	return os.Getenv("HOME")
}

func Load() *Config {
	godotenv.Load()

	home := getHomeDir()
	settingsPath := filepath.Join(home, ".aek", "mcp", "settings.jsonc")

	port := "1351"
	host := "0.0.0.0"
	basePath := ""
	disableWeb := false
	jwtSecret := "mcphub-default-secret"
	skipAuth := false

	if data, err := os.ReadFile(settingsPath); err == nil {
		var settings map[string]interface{}
		if err := json.Unmarshal(data, &settings); err == nil {
			if v, ok := settings["port"].(float64); ok {
				port = strconv.Itoa(int(v))
			}
			if v, ok := settings["host"].(string); ok && v != "" {
				host = v
			}
			if v, ok := settings["basePath"].(string); ok {
				basePath = v
			}
			if v, ok := settings["disableWeb"].(bool); ok {
				disableWeb = v
			}
			if v, ok := settings["jwtSecret"].(string); ok && v != "" {
				jwtSecret = v
			}
			if v, ok := settings["skipAuth"].(bool); ok {
				skipAuth = v
			}
		}
	}

	// Environment variables override settings file
	if v := os.Getenv("PORT"); v != "" {
		port = v
	}
	if v := os.Getenv("HOST"); v != "" {
		host = v
	}
	if v := os.Getenv("BASE_PATH"); v != "" {
		basePath = v
	}
	if v := os.Getenv("DISABLE_WEB"); v != "" {
		disableWeb, _ = strconv.ParseBool(v)
	}
	if v := os.Getenv("JWT_SECRET"); v != "" {
		jwtSecret = v
	}

	nodeEnv := os.Getenv("NODE_ENV")
	if nodeEnv == "" {
		nodeEnv = "production"
	}

	AppConfig = &Config{
		Port:       port,
		Host:       host,
		BasePath:   basePath,
		DisableWeb: disableWeb,
		JWTSecret:  jwtSecret,
		NodeEnv:    nodeEnv,
		SkipAuth:   skipAuth,
	}
	return AppConfig
}

func (c *Config) APIPrefix() string {
	if c.BasePath != "" {
		return c.BasePath + "/api"
	}
	return "/api"
}

func (c *Config) FullPath(path string) string {
	if c.BasePath != "" {
		return c.BasePath + path
	}
	return path
}

func GetSettingsPath() string {
	home := getHomeDir()
	return filepath.Join(home, ".aek", "mcp", "settings.jsonc")
}

func ReadSettingsJson() map[string]interface{} {
	path := GetSettingsPath()
	data, err := os.ReadFile(path)
	if err != nil {
		return map[string]interface{}{}
	}
	var settings map[string]interface{}
	if err := json.Unmarshal(data, &settings); err != nil {
		return map[string]interface{}{}
	}
	return settings
}

func WriteSettingsJson(updates map[string]interface{}) error {
	settings := ReadSettingsJson()
	for k, v := range updates {
		settings[k] = v
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(GetSettingsPath(), data, 0644)
}
