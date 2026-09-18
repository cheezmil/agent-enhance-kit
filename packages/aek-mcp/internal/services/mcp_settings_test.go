package services

import (
	"testing"
)

func TestParseMcpSettingsEntry_NormalTwoLayer(t *testing.T) {
	entry := McpSettingsEntry{
		"enabled": true,
		"owner":   "admin",
		"exa": map[string]interface{}{
			"command": "npx",
			"args":    []interface{}{"-y", "exa-mcp-server"},
			"env": map[string]interface{}{
				"EXA_API_KEY": "key123",
			},
		},
	}
	s := parseMcpSettingsEntry("exa", entry)
	if s == nil {
		t.Fatal("returned nil")
	}
	if s.Command != "npx" {
		t.Fatalf("command = %q, want npx", s.Command)
	}
	if s.Env["EXA_API_KEY"] != "key123" {
		t.Fatalf("env EXA_API_KEY missing")
	}
}

func TestParseMcpSettingsEntry_BrokenThreeLayer(t *testing.T) {
	// Regression: user edited raw JSON and accidentally wrapped the MCP config
	// in an extra "exa" layer. Parser must recurse and find the real config.
	entry := McpSettingsEntry{
		"enabled": true,
		"exa": map[string]interface{}{
			"enabled": true,
			"owner":   "admin",
			"exa": map[string]interface{}{
				"command": "npx",
				"args":    []interface{}{"-y", "exa-mcp-server"},
				"env": map[string]interface{}{
					"EXA_API_KEY": "key123",
				},
			},
		},
	}
	s := parseMcpSettingsEntry("exa", entry)
	if s == nil {
		t.Fatal("returned nil — parser failed on 3-layer nesting")
	}
	if s.Command != "npx" {
		t.Fatalf("command = %q, want npx", s.Command)
	}
	if s.Env["EXA_API_KEY"] != "key123" {
		t.Fatalf("env EXA_API_KEY missing")
	}
}

func TestParseMcpSettingsEntry_URLType(t *testing.T) {
	entry := McpSettingsEntry{
		"enabled": true,
		"ctx": map[string]interface{}{
			"type": "streamable-http",
			"url":  "https://mcp.context7.com/mcp",
		},
	}
	s := parseMcpSettingsEntry("ctx", entry)
	if s == nil {
		t.Fatal("returned nil")
	}
	if s.URL != "https://mcp.context7.com/mcp" {
		t.Fatalf("url = %q", s.URL)
	}
	if s.Type != "streamable-http" {
		t.Fatalf("type = %q", s.Type)
	}
}

func TestFindMcpConfig(t *testing.T) {
	// Deeply nested case.
	m := map[string]interface{}{
		"a": map[string]interface{}{
			"b": map[string]interface{}{
				"c": map[string]interface{}{
					"command": "node",
					"args":    []interface{}{"server.js"},
				},
			},
		},
	}
	result := findMcpConfig(m)
	if result == nil {
		t.Fatal("returned nil on deeply nested config")
	}
	if result["command"] != "node" {
		t.Fatalf("found wrong object")
	}
}
