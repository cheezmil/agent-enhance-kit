package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"

	"github.com/cheezmil/aek-mcp/internal/config"
	"github.com/cheezmil/aek-mcp/internal/handlers"
	"github.com/cheezmil/aek-mcp/internal/services"
)

func main() {
	initFlag := flag.Bool("init", false, "Initialize directory structure and default config files, then exit")
	flag.Parse()

	if *initFlag {
		runInit()
		return
	}

	config.Load()
	services.InitStore()
	services.LoadMcpSettings()

	services.ConnectAllEnabledServers(context.Background())
	handlers.InitMCPProxy()

	ginRouter := handlers.SetupRouter()
	mcpHandler := handlers.GetMCPProxyHandler()

	// Wrap the MCP handler with the group tool whitelist filter.
	// Every MCP request must include ?group=<name>.
	mcpHandler = handlers.GroupToolFilterMiddleware(mcpHandler)

	// gin is the pure API backend — no static files, no reverse proxy, no base path
	// stripping. Next.js (1351) proxies /aek-mcp/api/*, /aek-mcp/mcp/* etc. here
	// via rewrites.
	mux := http.NewServeMux()
	mux.Handle("/mcp", mcpHandler)
	mux.Handle("/mcp/", mcpHandler)
	mux.Handle("/", ginRouter)

	// If BasePath is configured, also register MCP under the base path so
	// URLs returned by GetTutorialConfig (e.g. /aek-mcp/mcp) work directly.
	if config.AppConfig.BasePath != "" {
		mux.Handle(config.AppConfig.BasePath+"/mcp", mcpHandler)
		mux.Handle(config.AppConfig.BasePath+"/mcp/", mcpHandler)
	}

	addr := config.AppConfig.Host + ":" + config.AppConfig.Port
	fmt.Printf("Server is running on %s\n", addr)
	fmt.Printf("API endpoints: /api/*, /mcp, /health, /config\n")

	if err := http.ListenAndServe(addr, mux); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to start server: %v\n", err)
		os.Exit(1)
	}
}

func runInit() {
	// 1. 生成 .internal.json 和 db/system/ 目录
	config.Load()

	// 2. 创建 settings/user-custom-configuration/ 空目录
	if err := services.InitConfigDirs(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create config dirs: %v\n", err)
		os.Exit(1)
	}

	// 3. 用嵌入模板创建默认文件（不覆盖已有）
	created, err := services.WriteDefaultConfigFiles()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to write default config files: %v\n", err)
		os.Exit(1)
	}
	for dest, src := range created {
		fmt.Printf("[aek-mcp] Created %s (from %s)\n", dest, src)
	}

	fmt.Println("[aek-mcp] Initialization complete")
}