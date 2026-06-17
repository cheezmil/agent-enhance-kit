package main

import (
	"context"
	"fmt"
	"net/http"
	"os"

	"github.com/cheezmil/aek-mcp/internal/config"
	"github.com/cheezmil/aek-mcp/internal/handlers"
	"github.com/cheezmil/aek-mcp/internal/services"
)

func main() {
	config.Load()
	services.InitStore()
	services.LoadMcpSettings()

	// Connect to all enabled MCP servers
	services.ConnectAllEnabledServers(context.Background())

	// Initialize the MCP proxy server (aggregates all upstream tools)
	handlers.InitMCPProxy()

	ginRouter := handlers.SetupRouter()

	// Wrap gin with net/http mux so /mcp is handled by the Streamable HTTP proxy
	// before gin's routing tree (and its SPA catch-all) gets a chance.
	mux := http.NewServeMux()
	mcpHandler := handlers.GetMCPProxyHandler()
	mux.Handle("/mcp", mcpHandler)
	mux.Handle("/mcp/", mcpHandler)
	mux.Handle("/", ginRouter)

	addr := config.AppConfig.Host + ":" + config.AppConfig.Port
	fmt.Printf("Server is running on %s\n", addr)
	fmt.Printf("API available at http://localhost:%s/api\n", config.AppConfig.Port)

	if err := http.ListenAndServe(addr, mux); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to start server: %v\n", err)
		os.Exit(1)
	}
}
