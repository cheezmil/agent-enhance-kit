package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	version = "0.1.1"
)

var rootCmd = &cobra.Command{
	Use:   "aek",
	Short: "Agent Enhance Kit - standalone search broker",
}

func emitJSON(payload interface{}) {
	data, _ := json.MarshalIndent(payload, "", "  ")
	fmt.Println(string(data))
}

func flagOrArg(cmd *cobra.Command, args []string, flagName string, idx int) string {
	if v, _ := cmd.Flags().GetString(flagName); v != "" {
		return v
	}
	if idx < len(args) {
		return args[idx]
	}
	return ""
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
