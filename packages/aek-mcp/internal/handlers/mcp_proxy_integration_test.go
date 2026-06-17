//go:build integration

package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/cheezmil/aek-mcp/internal/config"
	"github.com/cheezmil/aek-mcp/internal/handlers"
	"github.com/cheezmil/aek-mcp/internal/services"
)

var (
	testBaseURL string
	testServer  *http.Server
)

func findFreePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	port := l.Addr().(*net.TCPAddr).Port
	l.Close()
	return port, nil
}

func TestMain(m *testing.M) {
	port, err := findFreePort()
	if err != nil {
		fmt.Fprintf(os.Stderr, "cannot find free port: %v\n", err)
		os.Exit(1)
	}

	config.AppConfig = &config.Config{
		Host:       "127.0.0.1",
		Port:       strconv.Itoa(port),
		DisableWeb: true,
	}

	services.InitStore()
	handlers.InitMCPProxy()

	ginRouter := handlers.SetupRouter()

	mux := http.NewServeMux()
	mcpHandler := handlers.GetMCPProxyHandler()
	mux.Handle("/mcp", mcpHandler)
	mux.Handle("/mcp/", mcpHandler)
	mux.Handle("/", ginRouter)

	testBaseURL = fmt.Sprintf("http://127.0.0.1:%d", port)
	testServer = &http.Server{
		Addr:    ":" + strconv.Itoa(port),
		Handler: mux,
	}

	go func() {
		if err := testServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "test server error: %v\n", err)
		}
	}()

	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		resp, err := http.Get(testBaseURL + "/health")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				break
			}
		}
		time.Sleep(200 * time.Millisecond)
	}

	code := m.Run()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	testServer.Shutdown(ctx)
	os.Exit(code)
}

func doTestRequest(method, path string, body interface{}, headers map[string]string) (int, http.Header, []byte) {
	var bodyReader io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, testBaseURL+path, bodyReader)
	if err != nil {
		return 0, nil, nil
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, nil, nil
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, resp.Header, b
}

func TestIntegration_HealthCheck(t *testing.T) {
	status, _, body := doTestRequest("GET", "/health", nil, nil)
	if status != http.StatusOK {
		t.Errorf("health check: expected 200, got %d; body: %s", status, string(body))
	}
}

func TestIntegration_MCP_Initialize(t *testing.T) {
	initReq := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "initialize",
		"params": map[string]interface{}{
			"protocolVersion": "2024-11-05",
			"capabilities":   map[string]interface{}{},
			"clientInfo": map[string]interface{}{
				"name":    "integration-test",
				"version": "1.0.0",
			},
		},
	}

	status, header, body := doTestRequest("POST", "/mcp", initReq, nil)
	if status != http.StatusOK {
		t.Fatalf("MCP initialize: expected 200, got %d; body: %s", status, string(body))
	}

	sessionID := header.Get("Mcp-Session-Id")
	if sessionID == "" {
		t.Error("missing Mcp-Session-Id header in response")
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	result, ok := resp["result"].(map[string]interface{})
	if !ok {
		t.Fatalf("response missing result field: %s", string(body))
	}

	serverInfo := result["serverInfo"].(map[string]interface{})
	if serverInfo["name"] != "aek-mcp" {
		t.Errorf("server name = %q, want %q", serverInfo["name"], "aek-mcp")
	}

	caps := result["capabilities"].(map[string]interface{})
	if caps["tools"] == nil {
		t.Error("capabilities.tools is nil")
	}

	t.Logf("session_id=%s, server=%v", sessionID, serverInfo)
}

func TestIntegration_MCP_ToolsList(t *testing.T) {
	initReq := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "initialize",
		"params": map[string]interface{}{
			"protocolVersion": "2024-11-05",
			"capabilities":   map[string]interface{}{},
			"clientInfo": map[string]interface{}{
				"name":    "integration-test-tools",
				"version": "1.0.0",
			},
		},
	}

	status, initHeader, body := doTestRequest("POST", "/mcp", initReq, nil)
	if status != http.StatusOK {
		t.Fatalf("initialize failed: %d %s", status, string(body))
	}

	sessionID := initHeader.Get("Mcp-Session-Id")
	if sessionID == "" {
		t.Fatalf("initialize did not return session ID")
	}

	toolsListReq := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      2,
		"method":  "tools/list",
		"params":  map[string]interface{}{},
	}

	status, _, body = doTestRequest("POST", "/mcp", toolsListReq, map[string]string{
		"Mcp-Session-Id": sessionID,
	})
	if status != http.StatusOK {
		t.Fatalf("tools/list: expected 200, got %d; body: %s", status, string(body))
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp["error"] != nil {
		t.Fatalf("tools/list returned error: %s", string(body))
	}

	t.Logf("tools/list response: %s", string(body))
}

func TestIntegration_MCP_NoContentType(t *testing.T) {
	req, _ := http.NewRequest("POST", testBaseURL+"/mcp", bytes.NewReader([]byte("{}")))
	req.Header.Set("Content-Type", "text/plain")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		t.Error("expected non-200 for wrong content-type, got 200")
	}

	t.Logf("wrong content-type: status=%d", resp.StatusCode)
}

func TestIntegration_MCP_WrongMethod(t *testing.T) {
	req, _ := http.NewRequest("PUT", testBaseURL+"/mcp", bytes.NewReader([]byte("{}")))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	t.Logf("PUT /mcp: status=%d", resp.StatusCode)
}

func TestIntegration_MCP_InvalidJSON(t *testing.T) {
	req, _ := http.NewRequest("POST", testBaseURL+"/mcp", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		t.Error("expected error for invalid JSON, got 200")
	}

	t.Logf("invalid JSON: status=%d", resp.StatusCode)
}

func TestIntegration_RESTAPI_Servers(t *testing.T) {
	status, _, body := doTestRequest("GET", "/api/servers", nil, nil)
	if status == http.StatusUnauthorized {
		t.Log("auth required (expected), servers endpoint works behind auth")
		return
	}
	if status != http.StatusOK {
		t.Errorf("GET /api/servers: expected 200 or 401, got %d; body: %s", status, string(body))
	}
}

func TestIntegration_CORS(t *testing.T) {
	req, _ := http.NewRequest("OPTIONS", testBaseURL+"/api/servers", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Access-Control-Request-Method", "GET")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.Header.Get("Access-Control-Allow-Origin") == "" {
		t.Error("missing Access-Control-Allow-Origin header")
	}

	t.Logf("CORS: status=%d, allow-origin=%s", resp.StatusCode, resp.Header.Get("Access-Control-Allow-Origin"))
}

func TestIntegration_MCP_UnknownMethod(t *testing.T) {
	initReq := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "nonexistent/method",
		"params":  map[string]interface{}{},
	}

	status, _, body := doTestRequest("POST", "/mcp", initReq, nil)
	t.Logf("unknown method: status=%d, body=%s", status, string(body))
}

func TestIntegration_MCP_BatchInitListTools(t *testing.T) {
	initReq := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "initialize",
		"params": map[string]interface{}{
			"protocolVersion": "2024-11-05",
			"capabilities":   map[string]interface{}{},
			"clientInfo": map[string]interface{}{
				"name":    "batch-test-client",
				"version": "1.0.0",
			},
		},
	}

	status, initHeader, body := doTestRequest("POST", "/mcp", initReq, nil)
	if status != http.StatusOK {
		t.Fatalf("initialize failed: %d %s", status, string(body))
	}

	sessionID := initHeader.Get("Mcp-Session-Id")
	if sessionID == "" {
		t.Fatalf("initialize did not return session ID")
	}

	sessionHeaders := map[string]string{
		"Mcp-Session-Id": sessionID,
	}

	notificationsInit := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "notifications/initialized",
	}
	status, _, _ = doTestRequest("POST", "/mcp", notificationsInit, sessionHeaders)
	t.Logf("notifications/initialized: status=%d", status)

	toolsListReq := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      2,
		"method":  "tools/list",
		"params":  map[string]interface{}{},
	}

	status, _, body = doTestRequest("POST", "/mcp", toolsListReq, sessionHeaders)
	if status != http.StatusOK {
		t.Fatalf("tools/list: expected 200, got %d; body: %s", status, string(body))
	}

	var resp map[string]interface{}
	json.Unmarshal(body, &resp)

	if resp["error"] != nil {
		t.Fatalf("tools/list returned error: %s", string(body))
	}

	result := resp["result"].(map[string]interface{})
	tools := result["tools"].([]interface{})
	t.Logf("batch test: found %d tools", len(tools))
}
