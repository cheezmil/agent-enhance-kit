package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/goccy/go-yaml"
	"github.com/pelletier/go-toml/v2"

	"github.com/cheezmil/aek-mcp/internal/config"
)

// AgentTool describes one AI coding tool that aek-mcp can be installed into.
// Keep in sync with TutorialPage.tsx AGENT_TOOLS ids.
type AgentTool struct {
	ID          string
	Name        string
	Format      string // json | jsonc | yaml | toml
	ServersKey  string // top-level key holding the server map
	ServersPath []string // nested path for ServersKey (e.g. ["mcp","servers"] for openclaw)
	ServerName  string // key used for aek-mcp inside the server map
	URLKey      string // field name for the URL inside the entry (default "url")
	ConfigPath  string // resolved absolute path (or "" when GUI-only)
	GUIOnly     bool   // no config file (Cherry Studio / Chatbox)
	DocFlag     bool
	// Custom transform for the server entry (some tools need type/http quirks).
	EntryOverride func(mcpURL string, key string) map[string]interface{}
}

// serversAt returns the nested servers map at the given path.
func serversAt(root map[string]interface{}, path []string) (map[string]interface{}, bool) {
	if len(path) == 0 {
		return root, false
	}
	current := root
	for i, key := range path {
		if i == len(path)-1 {
			v, ok := current[key].(map[string]interface{})
			return v, ok
		}
		next, ok := current[key].(map[string]interface{})
		if !ok {
			return nil, false
		}
		current = next
	}
	return nil, false
}

// setServersAt sets the nested servers map at the given path.
func setServersAt(root map[string]interface{}, path []string, servers map[string]interface{}) {
	if len(path) == 0 {
		return
	}
	current := root
	for i, key := range path {
		if i == len(path)-1 {
			current[key] = servers
			return
		}
		next, ok := current[key].(map[string]interface{})
		if !ok {
			next = map[string]interface{}{}
			current[key] = next
		}
		current = next
	}
}

// toolServersPath returns the effective servers path for a tool.
func toolServersPath(tool *AgentTool) []string {
	if len(tool.ServersPath) > 0 {
		return tool.ServersPath
	}
	return []string{tool.ServersKey}
}

// toolURLKey returns the effective URL key for a tool.
func toolURLKey(tool *AgentTool) string {
	if tool.URLKey != "" {
		return tool.URLKey
	}
	return "url"
}

// AgentTools is the full list of supported agent tools.
var AgentTools = []AgentTool{
	{
		ID: "claude-code", Name: "Claude Code", Format: "json", ServersKey: "mcpServers", ServerName: "aek_mcp",
		ConfigPath: homeJoin(".claude.json"),
	},
	{
		ID: "claude-desktop", Name: "Claude Desktop", Format: "json", ServersKey: "mcpServers", ServerName: "aek_mcp",
		ConfigPath: claudeDesktopPath(),
	},
	{ID: "cherry-studio", Name: "Cherry Studio", GUIOnly: true},
	{ID: "chatbox", Name: "Chatbox", GUIOnly: true},
	{
		ID: "cline", Name: "Cline", Format: "json", ServersKey: "mcpServers", ServerName: "aek_mcp",
		ConfigPath: clinePath(),
	},
	{
		ID: "codex", Name: "Codex", Format: "toml", ServersKey: "mcp_servers", ServerName: "aek_mcp",
		ConfigPath: codexPath(),
		EntryOverride: func(mcpURL, key string) map[string]interface{} {
			return map[string]interface{}{
				"url":     mcpURL,
				"enabled": true,
			}
		},
	},
	{
		ID: "continue", Name: "Continue", Format: "json", ServersKey: "mcpServers", ServerName: "aek_mcp",
		ConfigPath: continuePath(),
	},
	{
		ID: "cursor", Name: "Cursor", Format: "json", ServersKey: "mcpServers", ServerName: "aek_mcp",
		ConfigPath: homeJoin(".cursor", "mcp.json"),
	},
	{
		ID: "hermes", Name: "Hermes Agent", Format: "yaml", ServersKey: "mcp_servers", ServerName: "aek__mcp",
		ConfigPath: hermesConfigPath(),
		EntryOverride: func(mcpURL, key string) map[string]interface{} {
			return map[string]interface{}{
				"type":    "streamable-http",
				"url":     mcpURL,
				"enabled": true,
			}
		},
	},
	{
		ID: "opencode", Name: "OpenCode", Format: "json", ServersKey: "mcp", ServerName: "aek_mcp",
		ConfigPath: opencodePath(),
		EntryOverride: func(mcpURL, key string) map[string]interface{} {
			return map[string]interface{}{
				"type":    "remote",
				"url":     mcpURL,
				"enabled": true,
				"timeout": 6600000,
			}
		},
	},
	{
		ID: "vscode", Name: "VS Code (Copilot)", Format: "json", ServersKey: "servers", ServerName: "aek_mcp",
		ConfigPath: vscodePath(),
		EntryOverride: func(mcpURL, key string) map[string]interface{} {
			return map[string]interface{}{
				"type": "http",
				"url":  mcpURL,
			}
		},
	},
	{
		ID: "windsurf", Name: "Windsurf", Format: "json", ServersKey: "mcpServers", ServerName: "aek_mcp",
		ConfigPath: homeJoin(".codeium", "windsurf", "mcp_config.json"),
	},
	{
		ID: "workbuddy", Name: "WorkBuddy", Format: "jsonc", ServersKey: "mcpServers", ServerName: "aek_mcp",
		ConfigPath: homeJoin(".codebuddy", ".mcp.json"),
		EntryOverride: func(mcpURL, key string) map[string]interface{} {
			return map[string]interface{}{"type": "http", "url": mcpURL}
		},
	},
	{
		ID: "openclaw", Name: "OpenClaw", Format: "json", ServersKey: "mcp", ServerName: "aek_mcp",
		ServersPath: []string{"mcp", "servers"},
		ConfigPath:  homeJoin(".openclaw", "openclaw.json"),
		EntryOverride: func(mcpURL, key string) map[string]interface{} {
			return map[string]interface{}{"url": mcpURL, "transport": "streamable-http", "enabled": true}
		},
	},
	{
		ID: "qoder", Name: "Qoder", Format: "json", ServersKey: "mcpServers", ServerName: "aek_mcp",
		ConfigPath: homeJoin(".qoder", "settings.json"),
		EntryOverride: func(mcpURL, key string) map[string]interface{} {
			return map[string]interface{}{"type": "http", "url": mcpURL}
		},
	},
	{
		ID: "qwencode", Name: "QWencode", Format: "json", ServersKey: "mcpServers", ServerName: "aek_mcp",
		URLKey: "httpUrl",
		ConfigPath: homeJoin(".qwen", "settings.json"),
		EntryOverride: func(mcpURL, key string) map[string]interface{} {
			return map[string]interface{}{"httpUrl": mcpURL, "timeout": 60000}
		},
	},
	{
		ID: "antigravity", Name: "Antigravity", Format: "json", ServersKey: "mcpServers", ServerName: "aek_mcp",
		URLKey: "serverUrl",
		ConfigPath: homeJoin(".gemini", "config", "mcp_config.json"),
		EntryOverride: func(mcpURL, key string) map[string]interface{} {
			return map[string]interface{}{"serverUrl": mcpURL}
		},
	},
	{
		ID: "kiro", Name: "Kiro", Format: "json", ServersKey: "mcpServers", ServerName: "aek_mcp",
		ConfigPath: homeJoin(".kiro", "settings", "mcp.json"),
		EntryOverride: func(mcpURL, key string) map[string]interface{} {
			return map[string]interface{}{"url": mcpURL, "disabled": false}
		},
	},
	{
		ID: "kilocode", Name: "Kilo Code", Format: "jsonc", ServersKey: "mcp", ServerName: "aek_mcp",
		ConfigPath: homeJoin(".config", "kilo", "kilo.jsonc"),
		EntryOverride: func(mcpURL, key string) map[string]interface{} {
			return map[string]interface{}{"type": "remote", "url": mcpURL, "enabled": true}
		},
	},
	{
		ID: "pi", Name: "Pi Agent", Format: "json", ServersKey: "mcpServers", ServerName: "aek_mcp",
		ConfigPath: homeJoin(".pi", "agent", "mcp.json"),
		EntryOverride: func(mcpURL, key string) map[string]interface{} {
			return map[string]interface{}{"transport": "streamable-http", "url": mcpURL, "lifecycle": "eager"}
		},
	},
	{
		ID: "deepseek-harness", Name: "DeepSeek Harness", Format: "json", ServersKey: "mcpServers", ServerName: "aek_mcp",
		ConfigPath: homeJoin(".dsh", "mcp.json"),
		EntryOverride: func(mcpURL, key string) map[string]interface{} {
			return map[string]interface{}{"url": mcpURL, "type": "http"}
		},
	},
}

// GetAgentTool returns the agent definition by id.
func GetAgentTool(id string) *AgentTool {
	for i := range AgentTools {
		if AgentTools[i].ID == id {
			return &AgentTools[i]
		}
	}
	return nil
}

// GetAgentToolByPath returns the agent definition whose config path matches.
func GetAgentToolByPath(p string) *AgentTool {
	for i := range AgentTools {
		if AgentTools[i].GUIOnly || AgentTools[i].ConfigPath == "" {
			continue
		}
		if AgentTools[i].ConfigPath == p {
			return &AgentTools[i]
		}
	}
	return nil
}

func homeJoin(elem ...string) string {
	home, _ := os.UserHomeDir()
	return filepath.Join(append([]string{home}, elem...)...)
}

func claudeDesktopPath() string {
	if runtime.GOOS == "windows" {
		return filepath.Join(os.Getenv("APPDATA"), "Claude", "claude_desktop_config.json")
	}
	if runtime.GOOS == "darwin" {
		return filepath.Join(os.Getenv("HOME"), "Library", "Application Support", "Claude", "claude_desktop_config.json")
	}
	return homeJoin(".config", "Claude", "claude_desktop_config.json")
}

func clinePath() string {
	if runtime.GOOS == "windows" {
		return filepath.Join(os.Getenv("APPDATA"), "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json")
	}
	if runtime.GOOS == "darwin" {
		return homeJoin("Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json")
	}
	return homeJoin(".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json")
}

func continuePath() string {
	return homeJoin(".continue", "mcpServers", "mcp.json")
}

func hermesConfigPath() string {
	// Hermes reads ~/.hermes/config.yaml by default. Tutorial page historically
	// pointed at ~/.hermes/profiles/default/hermes_config.yaml — prefer the real
	// config file when present, otherwise the profile path.
	base := homeJoin(".hermes", "config.yaml")
	if _, err := os.Stat(base); err == nil {
		return base
	}
	return homeJoin(".hermes", "profiles", "default", "hermes_config.yaml")
}

func opencodePath() string {
	if runtime.GOOS == "windows" {
		return homeJoin(".config", "opencode", "opencode.json")
	}
	return homeJoin(".config", "opencode", "opencode.json")
}

func codexPath() string {
	return homeJoin(".codex", "config.toml")
}

func vscodePath() string {
	if runtime.GOOS == "windows" {
		return filepath.Join(os.Getenv("APPDATA"), "Code", "User", "mcp.json")
	}
	if runtime.GOOS == "darwin" {
		return homeJoin("Library", "Application Support", "Code", "User", "mcp.json")
	}
	return homeJoin(".config", "Code", "User", "mcp.json")
}

func defaultEntry(mcpURL, key string) map[string]interface{} {
	return map[string]interface{}{
		"type":    "streamable-http",
		"url":     mcpURL,
		"enabled": true,
	}
}

// BuildMcpURL builds the streamable-http URL for a user, mirroring
// GetTutorialConfig so CLI and HTTP paths produce identical URLs.
func BuildMcpURL(username, key, group string) string {
	host := "127.0.0.1"
	port := "1352"
	basePath := "/aek-mcp"
	if config.AppConfig != nil {
		if config.AppConfig.Host != "" {
			host = config.AppConfig.Host
		}
		if config.AppConfig.Port != "" {
			port = config.AppConfig.Port
		}
		basePath = config.AppConfig.BasePath
	}
	if host == "0.0.0.0" || host == "" {
		host = "localhost"
	}
	url := "http://" + host + ":" + port + basePath + "/mcp"
	parts := []string{}
	if group != "" {
		parts = append(parts, "group="+group)
	}
	if key != "" {
		parts = append(parts, "key="+key)
	}
	if len(parts) > 0 {
		url += "?" + strings.Join(parts, "&")
	}
	return url
}

// extractKey returns the current user's MCP key from the store, or "" when
// the store is not initialized (pure CLI mode).
func extractKey() string {
	if Store == nil {
		return ""
	}
	users := Store.GetAllUsers()
	if len(users) == 0 {
		return ""
	}
	for _, u := range users {
		if u.Role == "admin" {
			return u.Key
		}
	}
	return users[0].Key
}

func yamlUnmarshal(data []byte, v *map[string]interface{}) error {
	return YamlUnmarshal(data, v)
}

func yamlMarshal(v map[string]interface{}) ([]byte, error) {
	return YamlMarshal(v)
}

// YamlUnmarshal parses YAML bytes into a generic map (exported for handlers).
func YamlUnmarshal(data []byte, v *map[string]interface{}) error {
	return yaml.Unmarshal(data, v)
}

// YamlMarshal serializes a generic map to YAML (exported for handlers).
func YamlMarshal(v map[string]interface{}) ([]byte, error) {
	return yaml.Marshal(v)
}

// TomlUnmarshal parses TOML bytes into a generic map (exported for handlers).
func TomlUnmarshal(data []byte, v *map[string]interface{}) error {
	return toml.Unmarshal(data, v)
}

// TomlMarshal serializes a generic map to TOML (exported for handlers).
func TomlMarshal(v map[string]interface{}) ([]byte, error) {
	return toml.Marshal(v)
}

// InstallAgentToConfig writes aek-mcp into one agent's config file (merge-only).
// Returns the resolved path that was written (or "" when GUI-only).
func InstallAgentToConfig(tool *AgentTool, mcpURL string) error {
	if tool == nil {
		return fmt.Errorf("unknown agent")
	}
	if tool.GUIOnly {
		return nil
	}
	if tool.ConfigPath == "" {
		return fmt.Errorf("unsupported agent: %s", tool.ID)
	}

	if err := os.MkdirAll(filepath.Dir(tool.ConfigPath), 0755); err != nil {
		return err
	}

	if tool.Format == "yaml" {
		return installYaml(tool, mcpURL)
	}
	if tool.Format == "toml" {
		return installToml(tool, mcpURL)
	}
	return installJSON(tool, mcpURL)
}

func entryFor(tool *AgentTool, mcpURL, key string) map[string]interface{} {
	if tool.EntryOverride != nil {
		return tool.EntryOverride(mcpURL, key)
	}
	return defaultEntry(mcpURL, key)
}

func installJSON(tool *AgentTool, mcpURL string) error {
	raw, err := os.ReadFile(tool.ConfigPath)
	var root map[string]interface{}
	if err == nil {
		if uerr := json.Unmarshal(raw, &root); uerr != nil {
			// try JSONC
			cleaned := StripJsoncComments(string(raw))
			if uerr2 := json.Unmarshal([]byte(cleaned), &root); uerr2 != nil {
				root = map[string]interface{}{}
			}
		}
	} else {
		root = map[string]interface{}{}
	}
	if root == nil {
		root = map[string]interface{}{}
	}

	spath := toolServersPath(tool)
	servers := map[string]interface{}{}
	if existing, ok := serversAt(root, spath); ok {
		servers = existing
	}
	servers[tool.ServerName] = entryFor(tool, mcpURL, extractKey())

	setServersAt(root, spath, servers)
	data, err := marshalJSON(root)
	if err != nil {
		return err
	}
	return os.WriteFile(tool.ConfigPath, data, 0644)
}

// marshalJSON encodes with 2-space indent and no HTML escaping (preserves
// & in URLs instead of emitting \u0026).
func marshalJSON(v interface{}) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

func installYaml(tool *AgentTool, mcpURL string) error {
	p := tool.ConfigPath
	var root map[string]interface{}
	raw, err := os.ReadFile(p)
	if err == nil {
		if yerr := yamlUnmarshal(raw, &root); yerr != nil {
			root = map[string]interface{}{}
		}
	} else {
		root = map[string]interface{}{}
	}
	if root == nil {
		root = map[string]interface{}{}
	}

	spath := toolServersPath(tool)
	servers := map[string]interface{}{}
	if existing, ok := serversAt(root, spath); ok {
		servers = existing
	}
	servers[tool.ServerName] = entryFor(tool, mcpURL, extractKey())
	setServersAt(root, spath, servers)

	out, err := yamlMarshal(root)
	if err != nil {
		return err
	}
	return os.WriteFile(p, out, 0644)
}

func installToml(tool *AgentTool, mcpURL string) error {
	p := tool.ConfigPath
	var root map[string]interface{}
	raw, err := os.ReadFile(p)
	if err == nil {
		if terr := toml.Unmarshal(raw, &root); terr != nil {
			root = map[string]interface{}{}
		}
	} else {
		root = map[string]interface{}{}
	}
	if root == nil {
		root = map[string]interface{}{}
	}

	spath := toolServersPath(tool)
	servers := map[string]interface{}{}
	if existing, ok := serversAt(root, spath); ok {
		servers = existing
	}
	servers[tool.ServerName] = entryFor(tool, mcpURL, extractKey())
	setServersAt(root, spath, servers)

	out, err := TomlMarshal(root)
	if err != nil {
		return err
	}
	return os.WriteFile(p, out, 0644)
}

// RemoveAgentFromConfig removes the aek-mcp entry from one agent config file.
func RemoveAgentFromConfig(tool *AgentTool) error {
	if tool == nil || tool.GUIOnly || tool.ConfigPath == "" {
		return nil
	}
	if _, err := os.Stat(tool.ConfigPath); err != nil {
		return nil // not installed, nothing to do
	}

	if tool.Format == "yaml" {
		var root map[string]interface{}
		raw, err := os.ReadFile(tool.ConfigPath)
		if err != nil {
			return err
		}
		if err := yamlUnmarshal(raw, &root); err != nil {
			return err
		}
		spath := toolServersPath(tool)
		var servers map[string]interface{}
		if sv, ok := serversAt(root, spath); ok {
			servers = sv
		}
		if servers != nil {
		delete(servers, tool.ServerName)
		if len(servers) == 0 {
			// delete the leaf; cannot "delete" nested path easily
			// just set empty map
		} else {
			setServersAt(root, spath, servers)
		}
		out, err := yamlMarshal(root)
		if err != nil {
			return err
		}
		return os.WriteFile(tool.ConfigPath, out, 0644)
		}
		return nil
		}

		if tool.Format == "toml" {
		var root map[string]interface{}
		raw, err := os.ReadFile(tool.ConfigPath)
		if err != nil {
			return err
		}
		if err := toml.Unmarshal(raw, &root); err != nil {
			return err
		}
		spath := toolServersPath(tool)
		var servers map[string]interface{}
		if sv, ok := serversAt(root, spath); ok {
			servers = sv
		}
		if servers != nil {
		delete(servers, tool.ServerName)
		if len(servers) == 0 {
			// empty
		} else {
			setServersAt(root, spath, servers)
		}
		out, err := toml.Marshal(root)
		if err != nil {
			return err
		}
		return os.WriteFile(tool.ConfigPath, out, 0644)
		}
		return nil
		}

		var root map[string]interface{}
	raw, err := os.ReadFile(tool.ConfigPath)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(raw, &root); err != nil {
		return err
	}
	spath := toolServersPath(tool)
	var servers map[string]interface{}
	if sv, ok := serversAt(root, spath); ok {
		servers = sv
	}
	if servers != nil {
		delete(servers, tool.ServerName)
		if len(servers) == 0 {
			// empty
		} else {
			setServersAt(root, spath, servers)
		}
		data, err := marshalJSON(root)
		if err != nil {
			return err
		}
		return os.WriteFile(tool.ConfigPath, data, 0644)
	}
	return nil
}

// BackupConfig backs up an existing config file before any mutation.
func BackupConfig(path string) error {
	if _, err := os.Stat(path); err != nil {
		return nil
	}
	home, _ := os.UserHomeDir()
	backupDir := filepath.Join(home, ".aek", "mcp", "backup", time.Now().Format("20060102-150405"))
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	dest := filepath.Join(backupDir, filepath.Base(path))
	return os.WriteFile(dest, data, 0644)
}

// AgentHasEntry checks whether the aek-mcp entry exists in the agent's config file.
func AgentHasEntry(tool *AgentTool) (bool, error) {
	if tool == nil || tool.GUIOnly || tool.ConfigPath == "" {
		return false, nil
	}
	raw, err := os.ReadFile(tool.ConfigPath)
	if err != nil {
		return false, err
	}
	if tool.Format == "yaml" {
		var root map[string]interface{}
		if err := YamlUnmarshal(raw, &root); err != nil {
			return false, err
		}
		spath := toolServersPath(tool)
		var servers map[string]interface{}
		if sv, ok := serversAt(root, spath); ok {
		servers = sv
		}
		if servers == nil {
		return false, nil
		}
		_, ok := servers[tool.ServerName]
		return ok, nil
		}
		if tool.Format == "toml" {
		var root map[string]interface{}
		if err := TomlUnmarshal(raw, &root); err != nil {
		return false, err
		}
		spath := toolServersPath(tool)
		var servers map[string]interface{}
		if sv, ok := serversAt(root, spath); ok {
		servers = sv
		}
		if servers == nil {
		return false, nil
		}
		_, ok := servers[tool.ServerName]
		return ok, nil
		}
		var root map[string]interface{}
		if err := json.Unmarshal(raw, &root); err != nil {
		cleaned := StripJsoncComments(string(raw))
		if err2 := json.Unmarshal([]byte(cleaned), &root); err2 != nil {
		return false, err2
		}
		}
		spath := toolServersPath(tool)
		var servers map[string]interface{}
		if sv, ok := serversAt(root, spath); ok {
		servers = sv
		}
		if servers == nil {
		return false, nil
		}
		_, ok := servers[tool.ServerName]
		return ok, nil
}