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
		cleaned := StripJsoncComments(string(data))
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

	// The MCP config may be nested under the same key name, or buried deeper
	// (e.g. due to user editing the raw JSON and accidentally adding extra layers).
	// Walk the entry recursively, skip well-known entry-level keys, and return
	// the first nested object that carries MCP fields (command/url/type/args).
	mcpConfig := findMcpConfig(entry)

	if mcpConfig == nil {
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

// StripJsoncComments removes JSONC comments from a string
func StripJsoncComments(s string) string {
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

// findMcpConfig walks a server entry recursively (DFS) and returns the first
// nested object that carries at least one real MCP field
// (command, url, type, or args). It skips the given meta-key names
// (e.g. "enabled", "owner") which live at the entry level and should not be
// mistaken for MCP config. This makes parsing resilient against accidental
// extra nesting layers introduced via the raw JSON editor.
func findMcpConfig(m map[string]interface{}) map[string]interface{} {
	// Check current object first (best candidate is the shallowest valid one).
	if hasMcpField(m) {
		return m
	}
	// Otherwise recurse into nested maps (depth-first). Well-known meta keys
	// are implicit skip because they never carry MCP fields.
	for _, v := range m {
		nested, ok := v.(map[string]interface{})
		if !ok {
			continue
		}
		if result := findMcpConfig(nested); result != nil {
			return result
		}
	}
	return nil
}

// hasMcpField reports whether the map looks like an MCP server config
// rather than a wrapper / meta object.
func hasMcpField(m map[string]interface{}) bool {
	for _, key := range []string{"command", "url", "type"} {
		if v, ok := m[key]; ok && v != nil {
			return true
		}
	}
	if v, ok := m["args"]; ok {
		if arr, isArray := v.([]interface{}); isArray && len(arr) > 0 {
			return true
		}
	}
	return false
}
