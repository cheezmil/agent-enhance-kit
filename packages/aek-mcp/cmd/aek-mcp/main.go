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

	services.ConnectAllEnabledServers(context.Background())
	handlers.InitMCPProxy()

	ginRouter := handlers.SetupRouter()
	mcpHandler := handlers.GetMCPProxyHandler()

	// gin is the pure API backend — no static files, no reverse proxy, no base path
	// stripping. Next.js (1351) proxies /aek-mcp/api/*, /aek-mcp/mcp/* etc. here
	// via rewrites.
	mux := http.NewServeMux()
	mux.Handle("/mcp", mcpHandler)
	mux.Handle("/mcp/", mcpHandler)
	mux.Handle("/", ginRouter)

	addr := config.AppConfig.Host + ":" + config.AppConfig.Port
	fmt.Printf("Server is running on %s\n", addr)
	fmt.Printf("API endpoints: /api/*, /mcp, /health, /config\n")

	if err := http.ListenAndServe(addr, mux); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to start server: %v\n", err)
		os.Exit(1)
	}
}
