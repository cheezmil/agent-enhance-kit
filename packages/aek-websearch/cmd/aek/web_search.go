package main

import (
	"fmt"
	"strings"

	"agent-enhance-kit/internal/commands"
	"github.com/spf13/cobra"
)

var webSearchCmd = &cobra.Command{
	Use:   "websearch [query]",
	Short: "Web search and content tools",
	Long: `Web search and content tools.

Use as a search query:
  aek websearch "golang web frameworks"

Or use a subcommand for specialized operations:
  aek websearch extract "https://example.com"
  aek websearch doctor
  aek websearch budgets
  aek websearch test-provider serper`,
	Args: cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		query := flagOrArg(cmd, args, "query", 0)
		if query == "" {
			return cmd.Help()
		}

		mode, _ := cmd.Flags().GetString("mode")
		providersFlag, _ := cmd.Flags().GetString("providers")
		session, _ := cmd.Flags().GetString("session")

		var providersList []string
		if providersFlag != "" {
			for _, p := range strings.Split(providersFlag, ",") {
				providersList = append(providersList, strings.TrimSpace(p))
			}
		}

		b := commands.DefaultBroker()
		out, err := commands.Search(b, commands.SearchInput{
			Query:     query,
			Mode:      mode,
			Providers: providersList,
			SessionID: session,
		})
		if err != nil {
			return err
		}
		fmt.Print(out.Text)
		return nil
	},
}

var webSearchExtractCmd = &cobra.Command{
	Use:   "extract [url]",
	Short: "Extract clean text content from a URL via Exa Contents API",
	Args:  cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		rawURL := flagOrArg(cmd, args, "url", 0)
		if rawURL == "" {
			return fmt.Errorf("usage: aek websearch extract <url>")
		}

		content, err := commands.Extract(rawURL)
		if err != nil {
			return err
		}
		fmt.Println(content)
		return nil
	},
}

var webSearchCodeSearchCmd = &cobra.Command{
	Use:   "code-search [query]",
	Short: "Search code snippets via Exa Code Context API",
	Args:  cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		query := flagOrArg(cmd, args, "query", 0)
		if query == "" {
			return fmt.Errorf("usage: aek websearch code-search <query>")
		}
		tokens, _ := cmd.Flags().GetInt("tokens")

		out, err := commands.CodeSearch(query, tokens)
		if err != nil {
			return err
		}
		fmt.Println(out.Response)
		fmt.Printf("\n[tokens: %d, cost: $%.4f]\n", out.OutputTokens, out.CostDollars)
		return nil
	},
}

var webSearchDoctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Diagnose setup and show provider status",
	RunE: func(cmd *cobra.Command, args []string) error {
		b := commands.DefaultBroker()
		out, err := commands.Doctor(b)
		if err != nil {
			return err
		}
		fmt.Print(out)
		return nil
	},
}

var webSearchBudgetsCmd = &cobra.Command{
	Use:   "budgets",
	Short: "Show provider budget status",
	RunE: func(cmd *cobra.Command, args []string) error {
		b := commands.DefaultBroker()
		out, err := commands.Budgets(b)
		if err != nil {
			return err
		}
		fmt.Println(out)
		return nil
	},
}

var webSearchTestProviderCmd = &cobra.Command{
	Use:   "test-provider [provider]",
	Short: "Smoke-test a single provider",
	Args:  cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		provider := flagOrArg(cmd, args, "provider", 0)
		if provider == "" {
			return fmt.Errorf("usage: aek websearch test-provider <provider>")
		}
		query, _ := cmd.Flags().GetString("query")

		b := commands.DefaultBroker()
		out, err := commands.TestProvider(b, provider, query)
		if err != nil {
			return err
		}
		fmt.Print(out)
		return nil
	},
}

var webSearchKeyPoolCmd = &cobra.Command{
	Use:   "key-pool-status",
	Short: "Show API key pool status for all providers",
	RunE: func(cmd *cobra.Command, args []string) error {
		out, err := commands.KeyPoolStatus()
		if err != nil {
			return err
		}
		fmt.Print(out)
		return nil
	},
}

var webSearchKeyPoolDisableCmd = &cobra.Command{
	Use:   "key-pool-disable [provider] [index]",
	Short: "Permanently disable a key by index (persisted to disk)",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		provider := args[0]
		var idx int
		if _, err := fmt.Sscanf(args[1], "%d", &idx); err != nil {
			return fmt.Errorf("index must be a number")
		}

		out, err := commands.KeyPoolDisable(provider, idx)
		if err != nil {
			return err
		}
		fmt.Print(out)
		return nil
	},
}

var webSearchKeyPoolEnableCmd = &cobra.Command{
	Use:   "key-pool-enable [provider] [index]",
	Short: "Re-enable a disabled key by index (persisted to disk)",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		provider := args[0]
		var idx int
		if _, err := fmt.Sscanf(args[1], "%d", &idx); err != nil {
			return fmt.Errorf("index must be a number")
		}

		out, err := commands.KeyPoolEnable(provider, idx)
		if err != nil {
			return err
		}
		fmt.Print(out)
		return nil
	},
}

func init() {
	webSearchCmd.AddCommand(webSearchExtractCmd)
	webSearchCmd.AddCommand(webSearchCodeSearchCmd)
	webSearchCmd.AddCommand(webSearchDoctorCmd)
	webSearchCmd.AddCommand(webSearchBudgetsCmd)
	webSearchCmd.AddCommand(webSearchTestProviderCmd)
	webSearchCmd.AddCommand(webSearchKeyPoolCmd)
	webSearchCmd.AddCommand(webSearchKeyPoolDisableCmd)
	webSearchCmd.AddCommand(webSearchKeyPoolEnableCmd)

	webSearchCmd.Flags().StringP("mode", "m", "discovery", "Search mode: recovery, discovery, grounding, research")
	webSearchCmd.Flags().StringP("providers", "p", "", "Override providers (comma-separated)")
	webSearchCmd.Flags().StringP("session", "s", "", "Session ID for multi-turn context")

	webSearchCodeSearchCmd.Flags().Int("tokens", 0, "Token limit (0=auto)")
	webSearchTestProviderCmd.Flags().StringP("query", "q", "aek test", "Test query")
}
