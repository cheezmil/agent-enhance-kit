package handlers_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/cheezmil/aek-mcp/internal/handlers"
	"github.com/cheezmil/aek-mcp/internal/models"
	"github.com/cheezmil/aek-mcp/internal/services"
	"github.com/google/uuid"
)

const testUserKey = "test-user-key-abc123"
const testUsername = "testuser"

// fakeMCPServer is a minimal MCP-like handler that returns SSE-wrapped JSON-RPC
// responses, matching what the real /mcp endpoint serves.
func fakeMCPServer() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			w.WriteHeader(http.StatusOK)
			return
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		var envelope struct {
			Method string      `json:"method"`
			ID     interface{} `json:"id"`
		}
		if err := json.Unmarshal(body, &envelope); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		var payload []byte
		switch envelope.Method {
		case "tools/list":
			result := map[string]interface{}{
				"tools": []map[string]interface{}{
					{"name": "serverA__exa", "description": "search"},
					{"name": "serverA__websearch", "description": "search web"},
					{"name": "serverA__calc", "description": "calculator"},
					{"name": "serverB__read", "description": "read file"},
				},
			}
			resp, _ := json.Marshal(map[string]interface{}{
				"jsonrpc": "2.0", "id": envelope.ID, "result": result,
			})
			payload = wrapSSE(resp)
		case "tools/call":
			var callReq struct {
				Params struct {
					Name string `json:"name"`
				} `json:"params"`
			}
			_ = json.Unmarshal(body, &callReq)
			result := map[string]interface{}{
				"content": []map[string]string{
					{"type": "text", "text": "ok for " + callReq.Params.Name},
				},
			}
			resp, _ := json.Marshal(map[string]interface{}{
				"jsonrpc": "2.0", "id": envelope.ID, "result": result,
			})
			payload = wrapSSE(resp)
		default:
			resp, _ := json.Marshal(map[string]interface{}{
				"jsonrpc": "2.0", "id": envelope.ID, "result": map[string]interface{}{"capabilities": map[string]interface{}{}},
			})
			payload = wrapSSE(resp)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		w.Write(payload)
	})
}

// wrapSSE wraps a JSON-RPC payload into a single SSE event.
func wrapSSE(json []byte) []byte {
	return append(append(append([]byte("data: "), json...), '\n'), '\n')
}

// setupTestUser seeds a test user so the filter can resolve ?key=xxx to a
// username. Safe to call from multiple tests — also ensures Store is init'd
// and that the test user has a default group in memory.
func setupTestUser() {
	if services.Store == nil {
		services.InitStore()
	}
	if services.Store.GetUserByKey(testUserKey) != nil {
		return
	}
	services.Store.CreateUser(&models.User{
		Username: testUsername,
		Key:      testUserKey,
		Role:     "admin",
	})
	// Ensure a default group exists in memory for the test user.
	services.Store.CreateGroup(testUsername, &models.Group{
		ID:           "default",
		Name:         "default",
		Description:  "Default group (all tools)",
		Servers:      []string{},
		AllowedTools: []string{},
	})
}

// testGroupFilter runs the given MCP request through GroupToolFilterMiddleware
// wrapping a fake MCP server. `group` is the ?group= query param; request body
// and headers are forwarded as-is.
func testGroupFilter(t *testing.T, group string, body []byte, headers map[string]string) (int, map[string]interface{}, []byte) {
	t.Helper()
	setupTestUser()
	req := httptest.NewRequest(http.MethodPost, "/mcp?group="+group+"&key="+testUserKey, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	handler := handlers.GroupToolFilterMiddleware(fakeMCPServer())
	handler.ServeHTTP(w, req)
	// Fake server returns SSE; strip the "data: " prefix to get raw JSON.
	raw := bytes.TrimSpace(w.Body.Bytes())
	payload := raw
	if len(raw) > 0 && raw[0] == '\n' {
		payload = raw[1:]
	}
	payload = bytes.TrimPrefix(payload, []byte("data: "))
	payload = bytes.TrimSpace(payload)
	var full map[string]interface{}
	if err := json.Unmarshal(payload, &full); err != nil {
		t.Fatalf("response not valid JSON: %s", string(raw))
	}
	return w.Code, full, payload
}

// ensureStore guarantees services.Store is initialized before a test touches it.
func ensureStore() {
	if services.Store == nil {
		services.InitStore()
	}
	setupTestUser()
}

func TestGroupFilter_MissingGroup(t *testing.T) {
	ensureStore()
	status, resp, _ := testGroupFilter(t, "",
		[]byte(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`), nil)
	if status != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", status)
	}
	if _, ok := resp["success"]; !ok || resp["success"] != false {
		t.Fatalf("expected error response, got: %v", resp)
	}
}

func TestGroupFilter_UnknownGroup(t *testing.T) {
	ensureStore()
	status, _, body := testGroupFilter(t, "nonexistent",
		[]byte(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`), nil)
	if status != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d; body: %s", status, string(body))
	}
}

func TestGroupFilter_DefaultPassesAll(t *testing.T) {
	ensureStore()
	status, full, _ := testGroupFilter(t, "default",
		[]byte(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`), nil)
	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d", status)
	}
	result, ok := full["result"].(map[string]interface{})
	if !ok {
		t.Fatalf("missing result: %v", full)
	}
	tools, ok := result["tools"].([]interface{})
	if !ok {
		t.Fatalf("missing tools array")
	}
	if len(tools) != 4 {
		t.Fatalf("expected 4 tools for default group, got %d", len(tools))
	}
}

func TestGroupFilter_AllowedToolsWhitelist(t *testing.T) {
	ensureStore()
	id := "chat-" + uuid.New().String()[:8]
	chatGroup := &models.Group{
		ID:           id,
		Name:         id,
		Servers:      []string{},
		AllowedTools: []string{"serverA__exa"},
	}
	services.Store.CreateGroup(testUsername, chatGroup)
	defer func() { services.Store.DeleteGroup(testUsername, id) }()

	status, full, body := testGroupFilter(t, id,
		[]byte(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`), nil)
	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d; body=%s", status, string(body))
	}
	result := full["result"].(map[string]interface{})
	tools := result["tools"].([]interface{})
	if len(tools) != 1 {
		t.Fatalf("expected 1 tool for 'chat' group, got %d", len(tools))
	}
	name, _ := tools[0].(map[string]interface{})["name"]
	if name != "serverA__exa" {
		t.Fatalf("expected tool serverA__exa, got %v", name)
	}
}

func TestGroupFilter_CallAllowedTool(t *testing.T) {
	ensureStore()
	id := "chat2-" + uuid.New().String()[:8]
	chatGroup := &models.Group{
		ID:           id,
		Name:         id,
		Servers:      []string{},
		AllowedTools: []string{"serverA__exa"},
	}
	services.Store.CreateGroup(testUsername, chatGroup)
	defer func() { services.Store.DeleteGroup(testUsername, id) }()

	status, full, _ := testGroupFilter(t, id,
		[]byte(`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"serverA__exa","arguments":{}}}`), nil)
	if status != http.StatusOK {
		t.Fatalf("expected 200 for allowed tool, got %d", status)
	}
	if full["error"] != nil {
		t.Fatalf("unexpected error for allowed call: %v", full)
	}
}

func TestGroupFilter_CallForbiddenTool(t *testing.T) {
	ensureStore()
	id := "chat3-" + uuid.New().String()[:8]
	chatGroup := &models.Group{
		ID:           id,
		Name:         id,
		Servers:      []string{},
		AllowedTools: []string{"serverA__exa"},
	}
	services.Store.CreateGroup(testUsername, chatGroup)
	defer func() { services.Store.DeleteGroup(testUsername, id) }()

	status, full, _ := testGroupFilter(t, id,
		[]byte(`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"serverA__calc","arguments":{}}}`), nil)
	if status != http.StatusForbidden {
		t.Fatalf("expected 403 for forbidden tool, got %d", status)
	}
	if full["success"] != false {
		t.Fatalf("expected success=false, got: %v", full)
	}
}

func TestGroupFilter_InitializePassthrough(t *testing.T) {
	ensureStore()
	status, full, _ := testGroupFilter(t, "default",
		[]byte(`{"jsonrpc":"2.0","id":1,"method":"initialize"}`), nil)
	if status != http.StatusOK {
		t.Fatalf("initialize should pass through: got %d", status)
	}
	if full["error"] != nil {
		t.Fatalf("unexpected error in initialize: %v", full)
	}
}

func TestGroupFilter_GetRequestPassthrough(t *testing.T) {
	ensureStore()
	req := httptest.NewRequest(http.MethodGet, "/mcp?group=default&key="+testUserKey, nil)
	w := httptest.NewRecorder()
	handler := handlers.GroupToolFilterMiddleware(fakeMCPServer())
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GET should pass through with 200, got %d", w.Code)
	}
}
