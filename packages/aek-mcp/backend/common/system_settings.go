package common

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sync"
)

// SystemSettings represents aek-mcp system configuration from ~/.aek/mcp/settings.jsonc
type SystemSettings struct {
	Port              int    `json:"port"`
	JWTSecret         string `json:"jwtSecret"`
	JWTRefreshSecret  string `json:"jwtRefreshSecret"`
	ServerAddress     string `json:"serverAddress"`
	SessionSecret     string `json:"sessionSecret"`
	SQLitePath        string `json:"sqlitePath"`
	EnableGzip        *bool  `json:"enableGzip"`
	RedisConnString   string `json:"redisConnString"`
	GithubToken       string `json:"githubToken"`
	McpToolCallTimeout string `json:"mcpToolCallTimeout"`
}

var (
	systemSettingsCache *SystemSettings
	systemSettingsMu    sync.RWMutex
)

// GetSystemSettingsPath returns the cross-platform path to ~/.aek/mcp/settings.jsonc
var GetSystemSettingsPath = func() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("get user home directory: %w", err)
	}
	return filepath.Join(homeDir, ".aek", "mcp", "settings.jsonc"), nil
}

// stripJSONCCommentsSys removes // and /* */ comments from JSONC content,
// skipping // that appears inside double-quoted strings.
func stripJSONCCommentsSys(data []byte) []byte {
	s := string(data)
	var buf []rune
	inString := false
	escaped := false
	i := 0
	runes := []rune(s)
	n := len(runes)

	for i < n {
		ch := runes[i]

		if escaped {
			buf = append(buf, ch)
			escaped = false
			i++
			continue
		}

		if ch == '\\' && inString {
			buf = append(buf, ch)
			escaped = true
			i++
			continue
		}

		if ch == '"' {
			inString = !inString
			buf = append(buf, ch)
			i++
			continue
		}

		if inString {
			buf = append(buf, ch)
			i++
			continue
		}

		// Not in string: check for comments
		if ch == '/' && i+1 < n && runes[i+1] == '/' {
			// Line comment: skip until newline
			i += 2
			for i < n && runes[i] != '\n' {
				i++
			}
			continue
		}
		if ch == '/' && i+1 < n && runes[i+1] == '*' {
			// Block comment: skip until */
			i += 2
			for i+1 < n && !(runes[i] == '*' && runes[i+1] == '/') {
				i++
			}
			if i+1 < n {
				i += 2 // skip */
			}
			continue
		}

		buf = append(buf, ch)
		i++
	}

	// Clean trailing commas before } or ]
	cleaned := regexp.MustCompile(`,(\s*[}\]])`).ReplaceAllString(string(buf), "$1")
	return []byte(cleaned)
}

// loadSystemSettings reads and parses ~/.aek/mcp/settings.jsonc
func loadSystemSettings() (*SystemSettings, error) {
	settingsPath, err := GetSystemSettingsPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		if os.IsNotExist(err) {
			return &SystemSettings{}, nil
		}
		return nil, fmt.Errorf("read system settings file %s: %w", settingsPath, err)
	}

	stripped := stripJSONCCommentsSys(data)

	var settings SystemSettings
	if err := json.Unmarshal(stripped, &settings); err != nil {
		return nil, fmt.Errorf("parse system settings file %s: %w", settingsPath, err)
	}

	return &settings, nil
}

// GetSystemSettings returns the cached system settings, reloading if necessary.
func GetSystemSettings() (*SystemSettings, error) {
	systemSettingsMu.RLock()
	if systemSettingsCache != nil {
		defer systemSettingsMu.RUnlock()
		return systemSettingsCache, nil
	}
	systemSettingsMu.RUnlock()

	systemSettingsMu.Lock()
	defer systemSettingsMu.Unlock()

	if systemSettingsCache != nil {
		return systemSettingsCache, nil
	}

	settings, err := loadSystemSettings()
	if err != nil {
		return nil, err
	}

	systemSettingsCache = settings
	return systemSettingsCache, nil
}

// ReloadSystemSettings forces a reload of the system settings from disk.
func ReloadSystemSettings() (*SystemSettings, error) {
	systemSettingsMu.Lock()
	defer systemSettingsMu.Unlock()

	settings, err := loadSystemSettings()
	if err != nil {
		return nil, err
	}

	systemSettingsCache = settings
	return systemSettingsCache, nil
}

// ResetSystemSettingsCache clears the cached settings. Intended for testing only.
func ResetSystemSettingsCache() {
	systemSettingsMu.Lock()
	defer systemSettingsMu.Unlock()
	systemSettingsCache = nil
}

// ApplySystemSettings applies the loaded system settings to the global config variables.
func ApplySystemSettings() error {
	settings, err := GetSystemSettings()
	if err != nil {
		return err
	}

	if settings.Port > 0 {
		*Port = settings.Port
	}
	if settings.JWTSecret != "" {
		JWTSecret = settings.JWTSecret
	}
	if settings.JWTRefreshSecret != "" {
		JWTRefreshSecret = settings.JWTRefreshSecret
	} else if settings.JWTSecret != "" {
		JWTRefreshSecret = settings.JWTSecret
	}
	if settings.ServerAddress != "" {
		ServerAddress = settings.ServerAddress
	}
	if settings.SessionSecret != "" {
		SessionSecret = settings.SessionSecret
	}
	if settings.SQLitePath != "" {
		SQLitePath = settings.SQLitePath
	}
	if settings.EnableGzip != nil {
		*EnableGzip = *settings.EnableGzip
	}
	if settings.RedisConnString != "" {
		os.Setenv("REDIS_CONN_STRING", settings.RedisConnString)
	}
	if settings.GithubToken != "" {
		os.Setenv("GITHUB_TOKEN", settings.GithubToken)
	}
	if settings.McpToolCallTimeout != "" {
		os.Setenv("MCP_TOOL_CALL_TIMEOUT", settings.McpToolCallTimeout)
	}

	return nil
}
