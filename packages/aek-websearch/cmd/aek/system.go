package main

import (
	"fmt"

	"agent-enhance-kit/internal/config"
	"github.com/spf13/cobra"
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start HTTP server",
	RunE: func(cmd *cobra.Command, args []string) error {
		_ = config.Load()
		return runServer()
	},
}

var mcpCmd = &cobra.Command{
	Use:   "mcp",
	Short: "Start MCP server",
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Println("aek mcp server ready")
		return nil
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
}
