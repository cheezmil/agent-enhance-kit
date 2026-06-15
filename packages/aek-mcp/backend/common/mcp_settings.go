package common

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

// McpServerConfig represents the MCP-standard portion of a server entry.
type McpServerConfig struct {
	Command string            `json:"command"`
	Args    []string          `json:"args"`
	Env     map[string]string `json:"env"`
	Type    string            `json:"type"`
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
}

// AekServerMeta represents aek-specific metadata for a server.
type AekServerMeta struct {
	Enabled *bool  `json:"enabled"`
	Owner   string `json:"owner"`
}

// ServerEntry holds both parts of a server config from settings.jsonc.
type ServerEntry struct {
	Mcp McpServerConfig
	Aek AekServerMeta
}

// McpSettings represents the structure of ~/.aek/mcp/settings.jsonc
// Format:
//
//	{
//	  "exa": {
//	    "exa": { "command": "...", "args": [...], "env": {...} },
//	    "enabled": true,
//	    "owner": "admin"
//	  }
//	}
type McpSettings struct {
	Servers map[string]ServerEntry
}

var (
	mcpSettingsCache *McpSettings
	mcpSettingsMu    sync.RWMutex
)

// stripJSONCComments removes // and /* */ comments from JSONC content,
// skipping // that appears inside double-quoted strings.
func stripJSONCComments(data []byte) []byte {
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

// GetMcpSettingsPath returns the cross-platform path to ~/.aek/mcp/mcp-settings.jsonc
var GetMcpSettingsPath = func() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("get user home directory: %w", err)
	}
	return filepath.Join(homeDir, ".aek", "mcp", "mcp-settings.jsonc"), nil
}

// loadMcpSettings reads and parses ~/.aek/mcp/settings.jsonc
func loadMcpSettings() (*McpSettings, error) {
	settingsPath, err := GetMcpSettingsPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		if os.IsNotExist(err) {
			return &McpSettings{Servers: make(map[string]ServerEntry)}, nil
		}
		return nil, fmt.Errorf("read mcp settings file %s: %w", settingsPath, err)
	}

	stripped := stripJSONCComments(data)

	// Parse as raw map: each top-level key maps to an object
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(stripped, &raw); err != nil {
		return nil, fmt.Errorf("parse mcp settings file %s: %w", settingsPath, err)
	}

	servers := make(map[string]ServerEntry, len(raw))

	for serviceName, rawVal := range raw {
		// Each service value is an object with nested service name (MCP config) + aek fields
		var outer map[string]json.RawMessage
		if err := json.Unmarshal(rawVal, &outer); err != nil {
			return nil, fmt.Errorf("parse service %q outer: %w", serviceName, err)
		}

		var entry ServerEntry

		for key, val := range outer {
			if key == serviceName {
				// This is the MCP config object (key matches service name)
				if err := json.Unmarshal(val, &entry.Mcp); err != nil {
					return nil, fmt.Errorf("parse service %q mcp config: %w", serviceName, err)
				}
			} else if key == "enabled" {
				if err := json.Unmarshal(val, &entry.Aek.Enabled); err != nil {
					return nil, fmt.Errorf("parse service %q enabled: %w", serviceName, err)
				}
			} else if key == "owner" {
				if err := json.Unmarshal(val, &entry.Aek.Owner); err != nil {
					return nil, fmt.Errorf("parse service %q owner: %w", serviceName, err)
				}
			}
		}

		servers[serviceName] = entry
	}

	return &McpSettings{Servers: servers}, nil
}

// GetMcpSettings returns the cached MCP settings, reloading if necessary.
func GetMcpSettings() (*McpSettings, error) {
	mcpSettingsMu.RLock()
	if mcpSettingsCache != nil {
		defer mcpSettingsMu.RUnlock()
		return mcpSettingsCache, nil
	}
	mcpSettingsMu.RUnlock()

	mcpSettingsMu.Lock()
	defer mcpSettingsMu.Unlock()

	if mcpSettingsCache != nil {
		return mcpSettingsCache, nil
	}

	settings, err := loadMcpSettings()
	if err != nil {
		return nil, err
	}

	mcpSettingsCache = settings
	return mcpSettingsCache, nil
}

// ReloadMcpSettings forces a reload of the MCP settings from disk.
func ReloadMcpSettings() (*McpSettings, error) {
	mcpSettingsMu.Lock()
	defer mcpSettingsMu.Unlock()

	settings, err := loadMcpSettings()
	if err != nil {
		return nil, err
	}

	mcpSettingsCache = settings
	return mcpSettingsCache, nil
}

// ResetMcpSettingsCache clears the cached settings. Intended for testing only.
func ResetMcpSettingsCache() {
	mcpSettingsMu.Lock()
	defer mcpSettingsMu.Unlock()
	mcpSettingsCache = nil
}

// GetServiceEnvsFromSettings returns the env vars for a given service name.
func GetServiceEnvsFromSettings(serviceName string) (map[string]string, error) {
	settings, err := GetMcpSettings()
	if err != nil {
		return nil, err
	}

	entry, ok := settings.Servers[serviceName]
	if !ok || entry.Mcp.Env == nil {
		return make(map[string]string), nil
	}

	result := make(map[string]string, len(entry.Mcp.Env))
	for k, v := range entry.Mcp.Env {
		result[k] = v
	}
	return result, nil
}

// GetServiceEnvsFromSettingsByName looks up env vars by service name (case-insensitive).
func GetServiceEnvsFromSettingsByName(serviceName string) (map[string]string, error) {
	settings, err := GetMcpSettings()
	if err != nil {
		return nil, err
	}

	lowerName := strings.ToLower(serviceName)
	for name, entry := range settings.Servers {
		if strings.ToLower(name) == lowerName {
			if entry.Mcp.Env == nil {
				return make(map[string]string), nil
			}
			result := make(map[string]string, len(entry.Mcp.Env))
			for k, v := range entry.Mcp.Env {
				result[k] = v
			}
			return result, nil
		}
	}

	return make(map[string]string), nil
}
