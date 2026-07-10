package main

import (
	"fmt"
	"agent-enhance-kit/internal/api"
	"agent-enhance-kit/internal/config"
	"agent-enhance-kit/internal/mcp"
	"github.com/spf13/cobra"
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start REST API server (gin)",
	RunE: func(cmd *cobra.Command, args []string) error {
		_ = config.Load()
		return api.Run()
	},
}

var mcpCmd = &cobra.Command{
	Use:   "mcp",
	Short: "Start MCP server (Streamable HTTP by default, --stdio for local)",
	Long: `Start an MCP server for aek-websearch.

By default, starts a Streamable HTTP server on the configured port (default 1350).
Use --stdio to run in stdio mode (for local agent integration).

Examples:
  aek mcp                          # Streamable HTTP on :1350/mcp
  aek mcp --port 8080              # Streamable HTTP on :8080/mcp
  aek mcp --endpoint /custom       # Custom endpoint path
  aek mcp --stdio                  # Stdio mode (for local agent)`,
	RunE: func(cmd *cobra.Command, args []string) error {
		stdio, _ := cmd.Flags().GetBool("stdio")
		port, _ := cmd.Flags().GetInt("port")
		endpoint, _ := cmd.Flags().GetString("endpoint")

		_ = config.Load()
		srv := mcp.NewServer()

		if stdio {
			fmt.Fprintln(cmd.ErrOrStderr(), "aek mcp: starting stdio mode...")
			return srv.ServeStdio()
		}

		if port <= 0 {
			cfg := config.Load()
			port = cfg.Port
		}
		return srv.ServeHTTPWithPort(port, endpoint)
	},
}

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print version",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Printf("aek, version %s\n", version)
	},
}

func init() {
	rootCmd.AddCommand(webSearchCmd)
	rootCmd.AddCommand(serveCmd)
	rootCmd.AddCommand(mcpCmd)
	rootCmd.AddCommand(versionCmd)

	mcpCmd.Flags().Bool("stdio", false, "Run in stdio mode instead of Streamable HTTP")
	mcpCmd.Flags().Int("port", 0, "HTTP port (default: from config, usually 1350)")
	mcpCmd.Flags().String("endpoint", "/mcp", "HTTP endpoint path")
}
