package services

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/cheezmil/aek-mcp/internal/models"
)

// McpSettingsEntry represents one server entry in mcp-settings.jsonc
// Format: { "serverName": { "serverName": {command/url...}, "enabled": bool, "owner": "..." } }
type McpSettingsEntry map[string]interface{}

// GetMcpSettingsPath returns the legacy mcp-settings.jsonc path (for backward compat)
func GetMcpSettingsPath() string {
	return getMcpSettingsPath()
}

// GetMcpSettingsPathForUser returns the per-user mcp-settings.jsonc path
func GetMcpSettingsPathForUser(username string) string {
	return getMcpSettingsPathForUser(username)
}

func getMcpSettingsPath() string {
	return getMcpSettingsPathForUser("")
}

func getMcpSettingsPathForUser(username string) string {
	home, _ := os.UserHomeDir()
	if username == "" {
		// Fallback: return legacy path for backward compatibility
		return filepath.Join(home, ".aek", "mcp", "db", "user-custom-configuration", "aekmcp", "mcp-settings.jsonc")
	}
	return filepath.Join(home, ".aek", "mcp", "db", "user-custom-configuration", username, "mcp-settings.jsonc")
}

func LoadMcpSettings() {
	path := getMcpSettingsPath()
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Printf("[aek-mcp] mcp-settings.jsonc not found at %s, skipping\n", path)
		return
	}

	var entries map[string]McpSettingsEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		// Try stripping JSONC comments (// and /* */) before parsing
		cleaned := stripJsoncComments(string(data))
		if err2 := json.Unmarshal([]byte(cleaned), &entries); err2 != nil {
			fmt.Printf("[aek-mcp] Failed to parse mcp-settings.jsonc: %v\n", err2)
			return
		}
	}

	loaded := 0
	updated := 0
	for name, entry := range entries {
		server := parseMcpSettingsEntry(name, entry)
		if server == nil {
			continue
		}
		// Update if already exists, create if not
		if existing := Store.GetServer(name); existing != nil {
			// Update existing server config
			server.Tools = existing.Tools
			server.Prompts = existing.Prompts
			server.Resources = existing.Resources
			server.Status = existing.Status
			Store.UpdateServer(name, server)
			updated++
		} else {
			Store.CreateServer(server)
			loaded++
		}
	}
	fmt.Printf("[aek-mcp] Loaded %d new servers, updated %d servers from mcp-settings.jsonc\n", loaded, updated)
}

func parseMcpSettingsEntry(name string, entry McpSettingsEntry) *models.ServerConfig {
	server := &models.ServerConfig{
		Name:    name,
		Enabled: true,
	}

	// Parse enabled field
	if v, ok := entry["enabled"].(bool); ok {
		server.Enabled = v
	}

	// Parse owner field
	if v, ok := entry["owner"].(string); ok {
		server.Config = map[string]interface{}{"owner": v}
	}

	// The MCP config is nested under the same key name
	mcpConfigRaw, ok := entry[name]
	if !ok {
		// Fallback: look for any nested object that has command/url/type
		for k, v := range entry {
			if k == "enabled" || k == "owner" {
				continue
			}
			if nested, isMap := v.(map[string]interface{}); isMap {
				mcpConfigRaw = nested
				break
			}
		}
	}

	mcpConfig, ok := mcpConfigRaw.(map[string]interface{})
	if !ok {
		return nil
	}

	// Parse type
	if v, ok := mcpConfig["type"].(string); ok {
		server.Type = v
	}

	// Parse URL (for http/sse/streamable-http)
	if v, ok := mcpConfig["url"].(string); ok {
		server.URL = v
	}

	// Parse command (for stdio)
	if v, ok := mcpConfig["command"].(string); ok {
		server.Command = v
	}

	// Parse args
	if v, ok := mcpConfig["args"].([]interface{}); ok {
		args := make([]string, 0, len(v))
		for _, a := range v {
			if s, ok := a.(string); ok {
				args = append(args, s)
			}
		}
		server.Args = args
	}

	// Parse env
	if v, ok := mcpConfig["env"].(map[string]interface{}); ok {
		env := make(map[string]string)
		for k, val := range v {
			if s, ok := val.(string); ok {
				env[k] = s
			}
		}
		server.Env = env
	}

	// Normalize type if not set
	if server.Type == "" {
		if server.Command != "" {
			server.Type = "stdio"
		} else if server.URL != "" {
			server.Type = "streamable-http"
		}
	}

	return server
}

func stripJsoncComments(s string) string {
	var result strings.Builder
	inString := false
	inLineComment := false
	inBlockComment := false
	prev := byte(0)

	for i := 0; i < len(s); i++ {
		ch := s[i]
		if inLineComment {
			if ch == '\n' {
				inLineComment = false
				result.WriteByte(ch)
			}
			continue
		}
		if inBlockComment {
			if prev == '*' && ch == '/' {
				inBlockComment = false
			}
			prev = ch
			continue
		}
		if inString {
			result.WriteByte(ch)
			if ch == '"' && prev != '\\' {
				inString = false
			}
			prev = ch
			continue
		}
		if ch == '"' {
			inString = true
			result.WriteByte(ch)
			prev = ch
			continue
		}
		if ch == '/' && i+1 < len(s) {
			if s[i+1] == '/' {
				inLineComment = true
				prev = ch
				continue
			}
			if s[i+1] == '*' {
				inBlockComment = true
				prev = ch
				continue
			}
		}
		result.WriteByte(ch)
		prev = ch
	}
	return result.String()
}
