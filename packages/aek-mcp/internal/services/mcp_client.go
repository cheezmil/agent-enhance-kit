package services

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/cheezmil/aek-mcp/internal/models"
	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/client/transport"
	"github.com/mark3labs/mcp-go/mcp"
)

type MCPClients struct {
	mu      sync.RWMutex
	clients map[string]client.MCPClient
}

var GlobalMCPClients = &MCPClients{
	clients: make(map[string]client.MCPClient),
}

func (mc *MCPClients) Get(serverName string) (client.MCPClient, bool) {
	mc.mu.RLock()
	defer mc.mu.RUnlock()
	c, ok := mc.clients[serverName]
	return c, ok
}

func (mc *MCPClients) Connect(ctx context.Context, serverName, url, authValue string) error {
	mc.mu.Lock()
	defer mc.mu.Unlock()

	if old, ok := mc.clients[serverName]; ok {
		old.Close()
		delete(mc.clients, serverName)
	}

	opts := []transport.StreamableHTTPCOption{}
	if authValue != "" {
		opts = append(opts, transport.WithHTTPHeaders(map[string]string{
			"Authorization": authValue,
		}))
	}

	c, err := client.NewStreamableHttpClient(url, opts...)
	if err != nil {
		return fmt.Errorf("create client: %w", err)
	}

	if err := c.Start(ctx); err != nil {
		c.Close()
		return fmt.Errorf("start client: %w", err)
	}

	initResult, err := c.Initialize(ctx, mcp.InitializeRequest{
		Params: mcp.InitializeParams{
			ProtocolVersion: "2025-03-26",
			ClientInfo:      mcp.Implementation{Name: "aek-mcp", Version: "0.5.0"},
			Capabilities:    mcp.ClientCapabilities{},
		},
	})
	if err != nil {
		c.Close()
		return fmt.Errorf("initialize: %w", err)
	}

	log.Printf("[MCP] Connected to %s (server: %s %s)", serverName, initResult.ServerInfo.Name, initResult.ServerInfo.Version)

	mc.clients[serverName] = c
	return nil
}

func (mc *MCPClients) Disconnect(serverName string) {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	if c, ok := mc.clients[serverName]; ok {
		c.Close()
		delete(mc.clients, serverName)
	}
	RefreshProxyToolsIfAvailable()
}

func (mc *MCPClients) ListTools(ctx context.Context, serverName string) ([]mcp.Tool, error) {
	c, ok := mc.Get(serverName)
	if !ok {
		return nil, fmt.Errorf("server %s not connected", serverName)
	}
	result, err := c.ListTools(ctx, mcp.ListToolsRequest{})
	if err != nil {
		return nil, fmt.Errorf("list tools: %w", err)
	}
	return result.Tools, nil
}

func (mc *MCPClients) CallTool(ctx context.Context, serverName, toolName string, args map[string]any) (*mcp.CallToolResult, error) {
	c, ok := mc.Get(serverName)
	if !ok {
		return nil, fmt.Errorf("server %s not connected", serverName)
	}
	result, err := c.CallTool(ctx, mcp.CallToolRequest{
		Params: mcp.CallToolParams{
			Name:      toolName,
			Arguments: args,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("call tool: %w", err)
	}
	return result, nil
}

func (mc *MCPClients) CloseAll() {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	for name, c := range mc.clients {
		c.Close()
		delete(mc.clients, name)
	}
}

func ConnectAllEnabledServers(ctx context.Context) {
	servers := Store.GetAllServers()
	for _, s := range servers {
		if !s.Enabled {
			continue
		}
		connectServer(ctx, s)
	}
}

// RefreshProxyToolsIfAvailable refreshes the MCP proxy tool list.
// This is a forward declaration to avoid circular imports;
// the actual implementation is set by handlers.InitMCPProxy.
var RefreshProxyToolsIfAvailable = func() {}

func ConnectServerByName(ctx context.Context, serverName string) error {
	s := Store.GetServer(serverName)
	if s == nil {
		return fmt.Errorf("server %s not found", serverName)
	}
	if !s.Enabled {
		return nil
	}
	err := connectServer(ctx, s)
	if err == nil {
		RefreshProxyToolsIfAvailable()
	}
	return err
}

func connectServer(ctx context.Context, s *models.ServerConfig) error {
	if s.URL == "" {
		return nil
	}
	authVal := ""
	connectCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := GlobalMCPClients.Connect(connectCtx, s.Name, s.URL, authVal); err != nil {
		log.Printf("[MCP] Failed to connect to %s: %v", s.Name, err)
		return err
	}
	return nil
}
