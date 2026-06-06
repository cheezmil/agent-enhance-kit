package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// ProviderConfig holds per-provider settings.
type ProviderConfig struct {
	Enabled        bool `json:"enabled"`
	TimeoutSeconds int  `json:"timeout_seconds,omitempty"`
	MaxResults     int  `json:"max_results,omitempty"`
}

// Config holds application configuration.
type Config struct {
	Port      int                         `json:"port"`
	BindHost  string                      `json:"bind_host"`
	RRF       bool                        `json:"rrf_enabled"`
	Providers map[string]ProviderConfig   `json:"providers"`
}

// aekDir returns ~/.aek/ (cross-platform).
func aekDir() string {
	if h, err := os.UserHomeDir(); err == nil {
		return filepath.Join(h, ".aek")
	}
	return ".aek"
}

// SettingsPath returns ~/.aek/settings.jsonc.
func SettingsPath() string {
	return filepath.Join(aekDir(), "settings.jsonc")
}

// KeysDir returns ~/.aek/web-search/.
func KeysDir() string {
	return filepath.Join(aekDir(), "web-search")
}

// stripJSONC removes // line comments from JSONC content.
func stripJSONC(data []byte) []byte {
	lines := strings.Split(string(data), "\n")
	var out []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "//") {
			continue
		}
		// Remove inline // comments (but not inside strings).
		// Simple heuristic: find // that's not inside quotes.
		inString := false
		result := []byte(line)
		for i := 0; i < len(line)-1; i++ {
			ch := line[i]
			if ch == '"' && (i == 0 || line[i-1] != '\\') {
				inString = !inString
			}
			if !inString && line[i] == '/' && line[i+1] == '/' {
				result = []byte(line[:i])
				break
			}
		}
		out = append(out, string(result))
	}
	return []byte(strings.Join(out, "\n"))
}

// ReadKeys reads all non-comment, non-empty lines from ~/.aek/web-search/<name>.txt.
func ReadKeys(name string) []string {
	path := filepath.Join(KeysDir(), name+".txt")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var keys []string
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "//") {
			continue
		}
		keys = append(keys, line)
	}
	return keys
}

// ReadKey returns the first key from ~/.aek/web-search/<name>.txt, or "".
func ReadKey(name string) string {
	keys := ReadKeys(name)
	if len(keys) > 0 {
		return keys[0]
	}
	return ""
}

// defaultConfig returns a sensible default config.
func defaultConfig() Config {
	return Config{
		Port:     1350,
		BindHost: "127.0.0.1",
		RRF:      false,
		Providers: map[string]ProviderConfig{
			"serper":     {Enabled: false, TimeoutSeconds: 60, MaxResults: 100},
			"tavily":     {Enabled: false, TimeoutSeconds: 60, MaxResults: 20},
			"exa":        {Enabled: false, TimeoutSeconds: 60, MaxResults: 100},
			"you":        {Enabled: false, TimeoutSeconds: 60, MaxResults: 100},
			"parallel":   {Enabled: false, TimeoutSeconds: 60, MaxResults: 20},
			"linkup":     {Enabled: false, TimeoutSeconds: 60, MaxResults: 20},
			"wolfram":    {Enabled: false, TimeoutSeconds: 60},
			"context7":   {Enabled: false, TimeoutSeconds: 60},
			"duckduckgo": {Enabled: false, TimeoutSeconds: 60},
			"yahoo":      {Enabled: false, TimeoutSeconds: 60},
		},
	}
}

var globalConfig *Config

// Load reads ~/.aek/settings.jsonc, falls back to defaults.
func Load() Config {
	if globalConfig != nil {
		return *globalConfig
	}

	cfg := defaultConfig()
	data, err := os.ReadFile(SettingsPath())
	if err == nil {
		clean := stripJSONC(data)
		json.Unmarshal(clean, &cfg)
	}

	// Override from env vars for backward compatibility.
	if raw := os.Getenv("AEK_PORT"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			cfg.Port = parsed
		}
	}
	if raw := os.Getenv("AEK_BIND_HOST"); raw != "" {
		cfg.BindHost = raw
	}

	globalConfig = &cfg
	return cfg
}

// IsProviderEnabled checks if a provider is enabled in settings.jsonc.
func IsProviderEnabled(name string) bool {
	// Env override for backward compatibility.
	envKey := fmt.Sprintf("AEK_%s_ENABLED", strings.ToUpper(name))
	if v := os.Getenv(envKey); v == "true" || v == "false" {
		return v == "true"
	}

	cfg := Load()
	if p, ok := cfg.Providers[name]; ok {
		return p.Enabled
	}
	return false
}

// ProviderTimeout returns the timeout for a provider, with fallback.
func ProviderTimeout(name string, fallback int) int {
	envKey := fmt.Sprintf("AEK_%s_TIMEOUT_SECONDS", strings.ToUpper(name))
	if raw := os.Getenv(envKey); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil {
			return v
		}
	}

	cfg := Load()
	if p, ok := cfg.Providers[name]; ok && p.TimeoutSeconds > 0 {
		return p.TimeoutSeconds
	}
	return fallback
}

// ProviderMaxResults returns the max_results for a provider, 0 means "use API default".
func ProviderMaxResults(name string) int {
	cfg := Load()
	if p, ok := cfg.Providers[name]; ok && p.MaxResults > 0 {
		return p.MaxResults
	}
	return 0
}

func init() {
	// Ensure directory structure exists on first run.
	dir := aekDir()
	keyDir := KeysDir()
	os.MkdirAll(dir, 0o755)
	os.MkdirAll(keyDir, 0o755)
}
