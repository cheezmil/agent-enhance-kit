package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/cheezmil/aek-mcp/internal/models"
	"github.com/cheezmil/aek-mcp/internal/services"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

const nameSeparator = "__"

// mcpProxy is the central MCP proxy server that aggregates all upstream MCP servers.
type mcpProxy struct {
	mu       sync.RWMutex
	mcpSrv   *server.MCPServer
	httpSrv  *server.StreamableHTTPServer
}

var proxy *mcpProxy

func InitMCPProxy() {
	proxy = &mcpProxy{}

	proxy.mcpSrv = server.NewMCPServer(
		"aek-mcp",
		"0.5.0",
		server.WithToolCapabilities(true),
		server.WithPromptCapabilities(true),
		server.WithResourceCapabilities(true, true),
	)

	proxy.httpSrv = server.NewStreamableHTTPServer(
		proxy.mcpSrv,
		server.WithEndpointPath("/mcp"),
	)

	// Wire up the refresh function so upstream connect/disconnect triggers tool re-sync
	services.RefreshProxyToolsIfAvailable = RefreshProxyTools

	// Sync tools from connected upstream servers
	proxy.syncTools()

	log.Println("[MCP Proxy] Initialized")
}

func GetMCPProxyHandler() http.Handler {
	return proxy.httpSrv
}

// RefreshProxyTools should be called when upstream servers connect/disconnect.
func RefreshProxyTools() {
	if proxy != nil {
		proxy.syncTools()
	}
}

// syncTools fetches tools from all connected upstream servers and re-registers them.
func (p *mcpProxy) syncTools() {
	servers := services.Store.GetAllServers()
	var allTools []server.ServerTool

	for _, srv := range servers {
		if !srv.Enabled || (srv.URL == "" && srv.Command == "") {
			continue
		}

		tools, err := services.GlobalMCPClients.ListTools(context.Background(), srv.Name)
		if err != nil {
			log.Printf("[MCP Proxy] Failed to list tools from %s: %v", srv.Name, err)
			continue
		}

		toolCfgMap := make(map[string]bool)
		for _, tc := range srv.Tools {
			toolCfgMap[tc.Name] = tc.Enabled
		}

		for _, tool := range tools {
			// Skip disabled tools
			if enabled, ok := toolCfgMap[tool.Name]; ok && !enabled {
				continue
			}

			proxyName := srv.Name + nameSeparator + tool.Name
			prefixedTool := mcp.Tool{
				Name:        proxyName,
				Description: tool.Description,
				InputSchema: tool.InputSchema,
			}
			serverName := srv.Name
			origToolName := tool.Name
			allTools = append(allTools, server.ServerTool{
				Tool: prefixedTool,
				Handler: func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
					return services.GlobalMCPClients.CallTool(ctx, serverName, origToolName, req.GetArguments())
				},
			})
		}
	}

	p.mcpSrv.SetTools(allTools...)
	log.Printf("[MCP Proxy] Synced %d tools from upstream servers", len(allTools))
}

// parseToolName splits "serverName__toolName" into (serverName, toolName).
func parseToolName(proxyName string) (serverName, toolName string, ok bool) {
	idx := strings.Index(proxyName, nameSeparator)
	if idx < 0 {
		return "", "", false
	}
	return proxyName[:idx], proxyName[idx+len(nameSeparator):], true
}

// MCPToolListResponse is the JSON response for tools/list via the proxy.
type MCPToolListResponse struct {
	Tools []MCPToolInfo `json:"tools"`
}

type MCPToolInfo struct {
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	InputSchema json.RawMessage `json:"inputSchema,omitempty"`
	Server      string          `json:"server,omitempty"`
}

// MCPToolCallRequest is the JSON request for tools/call via the proxy.
type MCPToolCallRequest struct {
	Name      string                 `json:"name"`
	Arguments map[string]interface{} `json:"arguments,omitempty"`
}

// HandleMCPProxyListTools returns all tools from all connected upstream servers.
// This is a convenience REST endpoint; the real MCP protocol endpoint is at /mcp.
func HandleMCPProxyListTools(c *gin.Context) {
	servers := services.Store.GetAllServers()
	var allTools []MCPToolInfo

	for _, srv := range servers {
		if !srv.Enabled || (srv.URL == "" && srv.Command == "") {
			continue
		}

		tools, err := services.GlobalMCPClients.ListTools(c.Request.Context(), srv.Name)
		if err != nil {
			continue
		}

		toolCfgMap := make(map[string]bool)
		for _, tc := range srv.Tools {
			toolCfgMap[tc.Name] = tc.Enabled
		}

		for _, tool := range tools {
			if enabled, ok := toolCfgMap[tool.Name]; ok && !enabled {
				continue
			}
			inputSchema, _ := json.Marshal(tool.InputSchema)
			allTools = append(allTools, MCPToolInfo{
				Name:        srv.Name + nameSeparator + tool.Name,
				Description: tool.Description,
				InputSchema: inputSchema,
				Server:      srv.Name,
			})
		}
	}

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    allTools,
	})
}

// HandleMCPProxyCallTool routes a tool call to the correct upstream server.
// This is a convenience REST endpoint; the real MCP protocol endpoint is at /mcp.
func HandleMCPProxyCallTool(c *gin.Context) {
	var req MCPToolCallRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	serverName, toolName, ok := parseToolName(req.Name)
	if !ok {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: fmt.Sprintf("Invalid tool name format: %s (expected serverName%stoolName)", req.Name, nameSeparator),
		})
		return
	}

	// Ensure connected
	if _, connected := services.GlobalMCPClients.Get(serverName); !connected {
		srv := services.Store.GetServer(serverName)
		if srv != nil && srv.URL != "" {
			ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
			defer cancel()
			if err := services.ConnectServerByName(ctx, serverName); err != nil {
				c.JSON(http.StatusServiceUnavailable, models.ApiResponse{
					Success: false,
					Message: "Failed to connect to " + serverName + ": " + err.Error(),
				})
				return
			}
		} else {
			c.JSON(http.StatusServiceUnavailable, models.ApiResponse{
				Success: false,
				Message: "Server not connected: " + serverName,
			})
			return
		}
	}

	result, err := services.GlobalMCPClients.CallTool(c.Request.Context(), serverName, toolName, req.Arguments)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ApiResponse{
			Success: false,
			Message: err.Error(),
		})
		return
	}

	contentArr := make([]map[string]interface{}, 0, len(result.Content))
	for _, item := range result.Content {
		switch v := item.(type) {
		case mcp.TextContent:
			contentArr = append(contentArr, map[string]interface{}{
				"type": "text",
				"text": v.Text,
			})
		case mcp.ImageContent:
			contentArr = append(contentArr, map[string]interface{}{
				"type":     "image",
				"data":     v.Data,
				"mimeType": v.MIMEType,
			})
		case mcp.AudioContent:
			contentArr = append(contentArr, map[string]interface{}{
				"type":     "audio",
				"data":     v.Data,
				"mimeType": v.MIMEType,
			})
		default:
			contentArr = append(contentArr, map[string]interface{}{
				"type": "text",
				"text": fmt.Sprintf("%v", item),
			})
		}
	}

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data: map[string]interface{}{
			"content": contentArr,
		},
	})
}
