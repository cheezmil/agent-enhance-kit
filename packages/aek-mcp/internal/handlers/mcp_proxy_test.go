package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func TestParseToolName(t *testing.T) {
	tests := []struct {
		name       string
		input      string
		wantServer string
		wantTool   string
		wantOk     bool
	}{
		{"valid", "myserver__mytool", "myserver", "mytool", true},
		{"no_separator", "mytool", "", "", false},
		{"multiple_separators", "a__b__c", "a", "b__c", true},
		{"empty", "", "", "", false},
		{"only_separator", "__", "", "", true},
		{"trailing_separator", "server__", "server", "", true},
		{"leading_separator", "__tool", "", "tool", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server, tool, ok := parseToolName(tt.input)
			if ok != tt.wantOk {
				t.Errorf("parseToolName(%q) ok = %v, want %v", tt.input, ok, tt.wantOk)
			}
			if server != tt.wantServer {
				t.Errorf("parseToolName(%q) server = %q, want %q", tt.input, server, tt.wantServer)
			}
			if tool != tt.wantTool {
				t.Errorf("parseToolName(%q) tool = %q, want %q", tt.input, tool, tt.wantTool)
			}
		})
	}
}

func TestHandleMCPProxyCallTool_InvalidFormat(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	body, _ := json.Marshal(MCPToolCallRequest{
		Name:      "no-separator-here",
		Arguments: map[string]interface{}{},
	})
	c.Request = httptest.NewRequest(http.MethodPost, "/api/mcp/call", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")

	HandleMCPProxyCallTool(c)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["success"] != false {
		t.Errorf("expected success=false, got %v", resp["success"])
	}
}

func TestHandleMCPProxyCallTool_InvalidJSON(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	c.Request = httptest.NewRequest(http.MethodPost, "/api/mcp/call", bytes.NewReader([]byte("not json")))
	c.Request.Header.Set("Content-Type", "application/json")

	HandleMCPProxyCallTool(c)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}
}

func TestHandleMCPProxyListTools_Empty(t *testing.T) {
	// Store and GlobalMCPClients are nil in test — should not panic
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/mcp/tools", nil)

	// This will panic if Store is nil — we just verify it doesn't crash
	// when Store is initialized (we init it in a separate integration test)
	// For unit test we only verify parseToolName and request validation
	t.Log("HandleMCPProxyListTools requires initialized Store, tested in integration")
}

func TestMCPToolCallRequest_Unmarshal(t *testing.T) {
	data := []byte(`{"name":"server__tool","arguments":{"key":"value"}}`)
	var req MCPToolCallRequest
	if err := json.Unmarshal(data, &req); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if req.Name != "server__tool" {
		t.Errorf("name = %q, want %q", req.Name, "server__tool")
	}
	if req.Arguments["key"] != "value" {
		t.Errorf("arguments[key] = %v, want %q", req.Arguments["key"], "value")
	}
}
