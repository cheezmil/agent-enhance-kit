package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var (
	// version is set via ldflags: -ldflags "-X main.version=1.2.3"
	// Default value is read from VERSION file at runtime
	version = "0.0.0-dev"
)

var rootCmd = &cobra.Command{
	Use:   "aek",
	Short: "Agent Enhance Kit - standalone search broker",
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		// Try to read version from VERSION file if default is dev
		if version == "0.0.0-dev" {
			if v, err := readVersionFile(); err == nil {
				version = v
			}
		}
	},
}

// readVersionFile reads the VERSION file from the same directory as the executable
// or from the current working directory
func readVersionFile() (string, error) {
	// Try executable directory first
	execPath, err := os.Executable()
	if err == nil {
		versionPath := filepath.Join(filepath.Dir(execPath), "VERSION")
		data, err := os.ReadFile(versionPath)
		if err == nil {
			return strings.TrimSpace(string(data)), nil
		}
	}

	// Try current working directory
	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}

	versionPath := filepath.Join(cwd, "VERSION")
	data, err := os.ReadFile(versionPath)
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(string(data)), nil
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
