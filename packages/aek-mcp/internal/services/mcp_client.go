package services

import (
	"context"
	"fmt"
	"log"
	"os"
	"runtime"
	"sync"
	"time"

	"github.com/cheezmil/aek-mcp/internal/models"
	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/client/transport"
	"github.com/mark3labs/mcp-go/mcp"
)

type MCPClients struct {
	mu       sync.RWMutex
	clients  map[string]client.MCPClient
	closers  map[string]chan struct{} // per-server done signal channels
}

var GlobalMCPClients = &MCPClients{
	clients: make(map[string]client.MCPClient),
	closers: make(map[string]chan struct{}),
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

func (mc *MCPClients) ConnectStdio(ctx context.Context, serverName, command string, args []string, envMap map[string]string) error {
	mc.mu.Lock()
	defer mc.mu.Unlock()

	if old, ok := mc.clients[serverName]; ok {
		old.Close()
		delete(mc.clients, serverName)
	}
	if oldDone, ok := mc.closers[serverName]; ok {
		close(oldDone)
		delete(mc.closers, serverName)
	}

	env := os.Environ()
	for k, v := range envMap {
		env = append(env, k+"="+v)
	}

	c, err := client.NewStdioMCPClient(command, env, args...)
	if err != nil {
		return fmt.Errorf("create stdio client: %w", err)
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

	log.Printf("[MCP] Connected to %s via stdio (server: %s %s)", serverName, initResult.ServerInfo.Name, initResult.ServerInfo.Version)

	mc.clients[serverName] = c

	// Start a goroutine to monitor stdio process exit.
	// The underlying transport's readResponses goroutine will encounter EOF
	// when the subprocess exits, which causes all pending requests to fail
	// with ErrTransportClosed. We detect this by polling with a short Ping.
	done := make(chan struct{})
	mc.closers[serverName] = done

	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				// Check if the transport is still alive by sending a Ping.
				pingCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
				err := c.Ping(pingCtx)
				cancel()
				if err != nil {
					log.Printf("[MCP] Stdio process %s exited: %v", serverName, err)
					// Clean up the client
					mc.mu.Lock()
					if c2, ok := mc.clients[serverName]; ok && c2 == c {
						c.Close()
						delete(mc.clients, serverName)
					}
					delete(mc.closers, serverName)
					mc.mu.Unlock()

					// Update server status in store
					s := Store.GetServer(serverName)
					if s != nil {
						s.Status = "disconnected"
						Store.UpdateServer(serverName, s)
					}
					RefreshProxyToolsIfAvailable()
					return
				}
			}
		}
	}()

	return nil
}

func (mc *MCPClients) Disconnect(serverName string) {
	mc.mu.Lock()
	if c, ok := mc.clients[serverName]; ok {
		c.Close()
		delete(mc.clients, serverName)
	}
	if done, ok := mc.closers[serverName]; ok {
		close(done)
		delete(mc.closers, serverName)
	}
	mc.mu.Unlock()
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

func (mc *MCPClients) GetPrompt(ctx context.Context, serverName, promptName string, args map[string]string) (*mcp.GetPromptResult, error) {
	c, ok := mc.Get(serverName)
	if !ok {
		return nil, fmt.Errorf("server %s not connected", serverName)
	}
	result, err := c.GetPrompt(ctx, mcp.GetPromptRequest{
		Params: mcp.GetPromptParams{
			Name:      promptName,
			Arguments: args,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("get prompt: %w", err)
	}
	return result, nil
}

func (mc *MCPClients) ListPrompts(ctx context.Context, serverName string) ([]mcp.Prompt, error) {
	c, ok := mc.Get(serverName)
	if !ok {
		return nil, fmt.Errorf("server %s not connected", serverName)
	}
	result, err := c.ListPrompts(ctx, mcp.ListPromptsRequest{})
	if err != nil {
		return nil, fmt.Errorf("list prompts: %w", err)
	}
	return result.Prompts, nil
}

func (mc *MCPClients) ListResources(ctx context.Context, serverName string) ([]mcp.Resource, error) {
	c, ok := mc.Get(serverName)
	if !ok {
		return nil, fmt.Errorf("server %s not connected", serverName)
	}
	result, err := c.ListResources(ctx, mcp.ListResourcesRequest{})
	if err != nil {
		return nil, fmt.Errorf("list resources: %w", err)
	}
	return result.Resources, nil
}

func (mc *MCPClients) CloseAll() {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	for name, c := range mc.clients {
		c.Close()
		delete(mc.clients, name)
	}
	for name, done := range mc.closers {
		close(done)
		delete(mc.closers, name)
	}
}

func ConnectAllEnabledServers(ctx context.Context) {
	servers := Store.GetAllServers()
	var wg sync.WaitGroup
	for _, s := range servers {
		if !s.Enabled {
			continue
		}
		wg.Add(1)
		go func(s *models.ServerConfig) {
			defer wg.Done()
			connectServer(ctx, s)
		}(s)
	}
	wg.Wait()
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
	var err error

	if s.URL != "" {
		err = connectServerHTTP(ctx, s)
	} else if s.Command != "" {
		err = connectServerStdio(ctx, s)
	} else {
		return nil
	}

	if err != nil {
		log.Printf("[MCP] Failed to connect to %s: %v", s.Name, err)
		s.Status = "disconnected"
		Store.UpdateServer(s.Name, s)
		return err
	}

	s.Status = "connected"

	// Fetch tools, prompts, and resources after successful connection
	fetchToolsPromptsResources(ctx, s)

	Store.UpdateServer(s.Name, s)
	return nil
}

func connectServerHTTP(ctx context.Context, s *models.ServerConfig) error {
	connectCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return GlobalMCPClients.Connect(connectCtx, s.Name, s.URL, "")
}

func connectServerStdio(ctx context.Context, s *models.ServerConfig) error {
	connectCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	command := s.Command
	args := s.Args

	if runtime.GOOS == "windows" {
		args = buildWindowsArgs(command, args)
		command = "cmd"
	}

	return GlobalMCPClients.ConnectStdio(connectCtx, s.Name, command, args, s.Env)
}

func buildWindowsArgs(command string, args []string) []string {
	return append([]string{"/c", command}, args...)
}

func fetchToolsPromptsResources(ctx context.Context, s *models.ServerConfig) {
	fetchCtx, fetchCancel := context.WithTimeout(ctx, 15*time.Second)
	defer fetchCancel()

	tools, err := GlobalMCPClients.ListTools(fetchCtx, s.Name)
	if err != nil {
		log.Printf("[MCP] Failed to list tools for %s: %v", s.Name, err)
	} else {
		s.Tools = make([]models.ToolConfig, 0, len(tools))
		for _, t := range tools {
			s.Tools = append(s.Tools, models.ToolConfig{
				Name:        t.Name,
				Description: t.Description,
				Enabled:     true,
			})
		}
		log.Printf("[MCP] Listed %d tools for %s", len(tools), s.Name)
	}

	prompts, err := GlobalMCPClients.ListPrompts(fetchCtx, s.Name)
	if err != nil {
		log.Printf("[MCP] Failed to list prompts for %s: %v", s.Name, err)
	} else {
		s.Prompts = make([]models.PromptConfig, 0, len(prompts))
		for _, p := range prompts {
			s.Prompts = append(s.Prompts, models.PromptConfig{
				Name:        p.Name,
				Description: p.Description,
				Enabled:     true,
			})
		}
		log.Printf("[MCP] Listed %d prompts for %s", len(prompts), s.Name)
	}

	resources, err := GlobalMCPClients.ListResources(fetchCtx, s.Name)
	if err != nil {
		log.Printf("[MCP] Failed to list resources for %s: %v", s.Name, err)
	} else {
		s.Resources = make([]models.ResourceConfig, 0, len(resources))
		for _, r := range resources {
			s.Resources = append(s.Resources, models.ResourceConfig{
				URI:         r.URI,
				Name:        r.Name,
				Description: r.Description,
				Enabled:     true,
			})
		}
		log.Printf("[MCP] Listed %d resources for %s", len(resources), s.Name)
	}
}
