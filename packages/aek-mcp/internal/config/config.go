package config

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
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
	AutoLogin     bool
	ShowLoginHint bool
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
	autoLogin := false
	showLoginHint := true

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
			// jwtSecret is auto-managed
			if v, ok := settings["autoLogin"].(bool); ok {
				autoLogin = v
			}
			if v, ok := settings["showLoginHint"].(bool); ok {
				showLoginHint = v
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
	// jwtSecret is auto-managed

	internalPath := filepath.Join(getHomeDir(), ".aek", "mcp", "db", ".internal.json")
	jwtSecret = loadOrCreateSecret(internalPath)

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
		AutoLogin:     autoLogin,
		ShowLoginHint: showLoginHint,
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

type internalConfig struct {
	JWTSecret string `json:"jwtSecret"`
}

func loadOrCreateSecret(path string) string {
	data, err := os.ReadFile(path)
	if err == nil {
		var cfg internalConfig
		if err := json.Unmarshal(data, &cfg); err == nil && cfg.JWTSecret != "" {
			return cfg.JWTSecret
		}
	}
	bytes := make([]byte, 32)
	rand.Read(bytes)
	secret := hex.EncodeToString(bytes)
	cfg := internalConfig{JWTSecret: secret}
	newData, _ := json.MarshalIndent(cfg, "", "  ")
	os.MkdirAll(filepath.Dir(path), 0755)
	os.WriteFile(path, newData, 0600)
	fmt.Printf("[aek-mcp] Generated new JWT secret\n")
	return secret
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
