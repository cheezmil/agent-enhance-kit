package mcp

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
	"agent-enhance-kit/internal/broker"
	"agent-enhance-kit/internal/commands"
	"agent-enhance-kit/internal/config"
	"agent-enhance-kit/internal/persistence"
	"agent-enhance-kit/internal/providers"
)

// MCPServer wraps the mcp-go server with aek-websearch tools.
type MCPServer struct {
	mcpServer *server.MCPServer
	broker    *broker.SearchBroker
}

// NewServer creates a fully configured MCP server with aek-websearch tools.
func NewServer() *MCPServer {
	b := newMCPPersistenceBroker()

	s := server.NewMCPServer(
		"aek-websearch",
		"0.1.1",
		server.WithToolCapabilities(false),
		server.WithRecovery(),
	)

	ms := &MCPServer{
		mcpServer: s,
		broker:    b,
	}

	ms.registerTools()
	return ms
}

func newMCPPersistenceBroker() *broker.SearchBroker {
	persist := persistence.NewStore("aek-data.json")
	_ = persist.Load()
	b := broker.NewSearchBrokerWithPersistence(persist)
	b.RegisterProvider(providers.NewDuckDuckGoProvider())
	b.RegisterProvider(providers.NewMockProvider())
	b.RegisterProvider(providers.NewYahooProvider())
	b.RegisterProvider(providers.NewSerperProvider())
	b.RegisterProvider(providers.NewTavilyProvider())
	b.RegisterProvider(providers.NewExaProvider())
	b.RegisterProvider(providers.NewLinkupProvider())
	b.RegisterProvider(providers.NewWolframProvider())
	b.RegisterProvider(providers.NewYouProvider())
	b.RegisterProvider(providers.NewParallelProvider())
	b.RegisterProvider(providers.NewContext7Provider())
	return b
}

func (ms *MCPServer) registerTools() {
	ms.mcpServer.AddTool(
		mcp.NewTool("web_search",
			mcp.WithDescription("Search the web using multiple providers (exa, tavily, serper, duckduckgo, etc.). Returns ranked results with titles, URLs, and snippets."),
			mcp.WithString("query", mcp.Required(), mcp.Description("The search query")),
			mcp.WithString("mode", mcp.Description("Search mode: discovery (default), grounding, research, recovery"), mcp.Enum("discovery", "grounding", "research", "recovery")),
			mcp.WithString("providers", mcp.Description("Comma-separated provider names to use (e.g. \"exa,tavily,serper\"). Empty = use defaults.")),
			mcp.WithNumber("max_results", mcp.Description("Maximum results to return (default 10)")),
			mcp.WithString("session_id", mcp.Description("Optional session ID for multi-turn context")),
		), ms.handleWebSearch,
	)

	ms.mcpServer.AddTool(
		mcp.NewTool("web_extract",
			mcp.WithDescription("Extract clean text content from a URL via Exa Contents API."),
			mcp.WithString("url", mcp.Required(), mcp.Description("The URL to extract content from")),
		), ms.handleExtract,
	)

	ms.mcpServer.AddTool(
		mcp.NewTool("web_code_search",
			mcp.WithDescription("Search code snippets via Exa Code Context API."),
			mcp.WithString("query", mcp.Required(), mcp.Description("The code search query")),
			mcp.WithNumber("tokens", mcp.Description("Token limit (0=auto)")),
		), ms.handleCodeSearch,
	)

	ms.mcpServer.AddTool(
		mcp.NewTool("web_doctor",
			mcp.WithDescription("Diagnose setup and show provider status (which providers are ready, which need API keys)."),
		), ms.handleDoctor,
	)

	ms.mcpServer.AddTool(
		mcp.NewTool("web_budgets",
			mcp.WithDescription("Show provider budget status."),
		), ms.handleBudgets,
	)

	ms.mcpServer.AddTool(
		mcp.NewTool("web_test_provider",
			mcp.WithDescription("Smoke-test a single provider with a query."),
			mcp.WithString("provider", mcp.Required(), mcp.Description("Provider name to test (e.g. exa, tavily, serper)")),
			mcp.WithString("query", mcp.Description("Test query (default: \"aek test\")")),
		), ms.handleTestProvider,
	)

	ms.mcpServer.AddTool(
		mcp.NewTool("web_key_pool_status",
			mcp.WithDescription("Show API key pool status for all providers."),
		), ms.handleKeyPoolStatus,
	)

	ms.mcpServer.AddTool(
		mcp.NewTool("web_key_pool_disable",
			mcp.WithDescription("Permanently disable an API key by index (persisted to disk)."),
			mcp.WithString("provider", mcp.Required(), mcp.Description("Provider name")),
			mcp.WithNumber("index", mcp.Required(), mcp.Description("Key index to disable")),
		), ms.handleKeyPoolDisable,
	)

	ms.mcpServer.AddTool(
		mcp.NewTool("web_key_pool_enable",
			mcp.WithDescription("Re-enable a disabled API key by index (persisted to disk)."),
			mcp.WithString("provider", mcp.Required(), mcp.Description("Provider name")),
			mcp.WithNumber("index", mcp.Required(), mcp.Description("Key index to enable")),
		), ms.handleKeyPoolEnable,
	)
}

// ── handlers ────────────────────────────────────────────────────────────────

func (ms *MCPServer) handleWebSearch(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	query, err := req.RequireString("query")
	if err != nil {
		return mcp.NewToolResultError("missing required parameter: query"), nil
	}

	var providersList []string
	if raw := req.GetString("providers", ""); raw != "" {
		for _, p := range splitComma(raw) {
			providersList = append(providersList, p)
		}
	}

	out, err := commands.Search(ms.broker, commands.SearchInput{
		Query:      query,
		Mode:       req.GetString("mode", "discovery"),
		Providers:  providersList,
		MaxResults: int(req.GetFloat("max_results", 10)),
		SessionID:  req.GetString("session_id", ""),
	})
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	return &mcp.CallToolResult{
		Content: []mcp.Content{
			mcp.TextContent{Type: "text", Text: out.Text},
			mcp.TextContent{Type: "text", Text: out.JSON},
		},
	}, nil
}

func (ms *MCPServer) handleExtract(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	rawURL, err := req.RequireString("url")
	if err != nil {
		return mcp.NewToolResultError("missing required parameter: url"), nil
	}
	content, err := commands.Extract(rawURL)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return mcp.NewToolResultText(content), nil
}

func (ms *MCPServer) handleCodeSearch(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	query, err := req.RequireString("query")
	if err != nil {
		return mcp.NewToolResultError("missing required parameter: query"), nil
	}
	out, err := commands.CodeSearch(query, int(req.GetFloat("tokens", 0)))
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return mcp.NewToolResultText(
		fmt.Sprintf("%s\n\n[tokens: %d, cost: $%.4f]", out.Response, out.OutputTokens, out.CostDollars),
	), nil
}

func (ms *MCPServer) handleDoctor(_ context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	out, err := commands.Doctor(ms.broker)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return mcp.NewToolResultText(out), nil
}

func (ms *MCPServer) handleBudgets(_ context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	out, err := commands.Budgets(ms.broker)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return mcp.NewToolResultText(out), nil
}

func (ms *MCPServer) handleTestProvider(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	provider, err := req.RequireString("provider")
	if err != nil {
		return mcp.NewToolResultError("missing required parameter: provider"), nil
	}
	out, err := commands.TestProvider(ms.broker, provider, req.GetString("query", "aek test"))
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return mcp.NewToolResultText(out), nil
}

func (ms *MCPServer) handleKeyPoolStatus(_ context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	out, err := commands.KeyPoolStatus()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return mcp.NewToolResultText(out), nil
}

func (ms *MCPServer) handleKeyPoolDisable(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	provider, err := req.RequireString("provider")
	if err != nil {
		return mcp.NewToolResultError("missing required parameter: provider"), nil
	}
	out, err := commands.KeyPoolDisable(provider, int(req.GetFloat("index", 0)))
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return mcp.NewToolResultText(out), nil
}

func (ms *MCPServer) handleKeyPoolEnable(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	provider, err := req.RequireString("provider")
	if err != nil {
		return mcp.NewToolResultError("missing required parameter: provider"), nil
	}
	out, err := commands.KeyPoolEnable(provider, int(req.GetFloat("index", 0)))
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return mcp.NewToolResultText(out), nil
}

// ── helpers ─────────────────────────────────────────────────────────────────

func splitComma(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// ── transports ──────────────────────────────────────────────────────────────

// ServeStdio starts the MCP server over stdio (for local/CLI use).
func (ms *MCPServer) ServeStdio() error {
	return server.ServeStdio(ms.mcpServer)
}

// ServeHTTP starts the MCP server as a Streamable HTTP server.
func (ms *MCPServer) ServeHTTP(addr, endpointPath string) error {
	if endpointPath == "" {
		endpointPath = "/mcp"
	}

	httpServer := server.NewStreamableHTTPServer(ms.mcpServer,
		server.WithEndpointPath(endpointPath),
	)

	mux := http.NewServeMux()
	mux.Handle(endpointPath, httpServer)

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","service":"aek-websearch-mcp","version":"0.1.1"}`)
	})

	log.Printf("AEK Websearch MCP server listening on %s%s", addr, endpointPath)
	log.Printf("Health check: %s/health", addr)

	return http.ListenAndServe(addr, mux)
}

// ServeHTTPWithPort starts the MCP server on a specific port, using config defaults for host.
func (ms *MCPServer) ServeHTTPWithPort(port int, endpointPath string) error {
	cfg := config.Load()
	addr := cfg.BindHost + ":" + strconv.Itoa(port)
	return ms.ServeHTTP(addr, endpointPath)
}
