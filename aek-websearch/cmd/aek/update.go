package main

import (
	"fmt"

	"agent-enhance-kit/internal/update"

	"github.com/spf13/cobra"
)

var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Update aek to the latest version",
	Long:  `Download and install the latest version of aek from GitHub releases.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Println("Checking for updates...")

		info, err := update.CheckForUpdate(version)
		if err != nil {
			return fmt.Errorf("failed to check for updates: %w", err)
		}

		if !info.NeedsUpdate {
			fmt.Printf("Already up to date (v%s)\n", info.Current)
			return nil
		}

		fmt.Printf("Updating from v%s to v%s...\n", info.Current, info.Latest)

		if err := update.DownloadAndReplace(info.Latest); err != nil {
			return fmt.Errorf("update failed: %w", err)
		}

		fmt.Printf("Successfully updated to v%s\n", info.Latest)
		return nil
	},
}

func init() {
	rootCmd.AddCommand(updateCmd)
}
