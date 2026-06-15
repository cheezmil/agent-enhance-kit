package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"agent-enhance-kit/internal/config"
	"agent-enhance-kit/internal/models"
	"agent-enhance-kit/internal/providers"
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
		caller, _ := cmd.Flags().GetString("caller")
		asJSON, _ := cmd.Flags().GetBool("json")
		freeOnly, _ := cmd.Flags().GetBool("free")

		b := newBroker()

		var providersList []models.ProviderName
		if providersFlag != "" {
			for _, p := range strings.Split(providersFlag, ",") {
				providersList = append(providersList, models.ProviderName(strings.TrimSpace(p)))
			}
		}

		q := models.SearchQuery{
			Query:     query,
			Mode:      models.SearchMode(mode),
			Providers: providersList,
			FreeOnly:   freeOnly,
			Caller:     caller,
		}

		var resp *models.SearchResponse
		var err error
		if session != "" {
			resp, err = b.SearchWithSession(context.Background(), q, session)
		} else {
			resp, err = b.Search(context.Background(), q)
		}
		if err != nil {
			return err
		}

		if asJSON {
			emitJSON(resp)
		} else {
			fmt.Printf("Query: %s\n", resp.Query)
			fmt.Printf("Mode: %s | Results: %d | Cached: %v\n", resp.Mode, resp.TotalResults, resp.Cached)
			if resp.SessionID != nil {
				fmt.Printf("Session: %s\n", *resp.SessionID)
			}
			fmt.Println()
			if len(resp.Results) == 0 {
				fmt.Println("No results found.")
				fmt.Println()
				if len(resp.Traces) > 0 {
					allSkipped := true
					for _, t := range resp.Traces {
						if t.Status != "skipped" {
							allSkipped = false
							break
						}
					}
					if allSkipped {
						fmt.Println("All providers were skipped (no API keys configured).")
						fmt.Println("Run 'aek websearch doctor' to check provider status.")
						fmt.Println("Or configure keys with: aek keys add <provider> <key>")
					}
				}
			}
			for i, r := range resp.Results {
				provider := ""
				if r.Provider != nil {
					provider = fmt.Sprintf(" [%s]", *r.Provider)
				}
				fmt.Printf("  %d. %s%s\n", i+1, r.Title, provider)
				fmt.Printf("     %s\n", r.URL)
				if r.Snippet != "" {
					snippet := r.Snippet
					if len(snippet) > 120 {
						snippet = snippet[:120]
					}
					fmt.Printf("     %s\n", snippet)
				}
				fmt.Println()
			}

			if len(resp.Traces) > 0 {
				fmt.Println("Provider traces:")
				for _, t := range resp.Traces {
					fmt.Printf("  %s: %s (%d results, %dms)\n", t.Provider, t.Status, t.ResultsCount, t.LatencyMs)
					if t.Error != nil {
						fmt.Printf("    Error: %s\n", *t.Error)
					}
				}
			}

			if len(resp.BudgetWarnings) > 0 {
				fmt.Println("Budget warnings:")
				for _, w := range resp.BudgetWarnings {
					fmt.Printf("  %s\n", w)
				}
			}
		}
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
		asJSON, _ := cmd.Flags().GetBool("json")

		content, err := providers.ExaContents([]string{rawURL})
		if err != nil {
			return err
		}

		if asJSON {
			emitJSON(map[string]string{"url": rawURL, "content": content})
		} else {
			fmt.Println(content)
		}
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
		asJSON, _ := cmd.Flags().GetBool("json")
		tokens, _ := cmd.Flags().GetInt("tokens")

		response, outputTokens, costDollars, err := providers.ExaCodeContext(query, tokens)
		if err != nil {
			return err
		}

		if asJSON {
			emitJSON(map[string]interface{}{
				"query":        query,
				"response":     response,
				"output_tokens": outputTokens,
				"cost_dollars":  costDollars,
			})
		} else {
			fmt.Println(response)
			fmt.Printf("\n[tokens: %d, cost: $%.4f]\n", outputTokens, costDollars)
		}
		return nil
	},
}

var webSearchDoctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Diagnose setup and show provider status",
	RunE: func(cmd *cobra.Command, args []string) error {
		asJSON, _ := cmd.Flags().GetBool("json")

		type check struct {
			Name   string `json:"name"`
			OK     bool   `json:"ok"`
			Detail string `json:"detail"`
		}
		var checks []check

		cfg := config.Load()
		checks = append(checks, check{Name: "Config", OK: true, Detail: fmt.Sprintf("port=%d", cfg.Port)})

		b := newBroker()
		statuses := b.GetAllProviderStatus()
		ready := 0
		needsKey := 0
		for _, status := range statuses {
			raw := fmt.Sprintf("%v", status["status"])
			display := statusDisplay[raw]
			if display == "OK" || display == "HEALTHY" {
				ready++
			} else if display == "MISSING KEY" {
				needsKey++
			}
		}
		checks = append(checks, check{Name: "Providers", OK: ready > 0, Detail: fmt.Sprintf("%d ready, %d need API keys", ready, needsKey)})

		if asJSON {
			emitJSON(map[string]interface{}{
				"checks":              checks,
				"providers_ready":     ready,
				"providers_need_keys": needsKey,
				"statuses":            statuses,
			})
		} else {
			for _, c := range checks {
				icon := "+"
				status := "OK"
				if !c.OK {
					icon = "!"
					status = "FAIL"
				}
				fmt.Printf("  [%s] %-15s %-5s %s\n", icon, c.Name, status, c.Detail)
			}
			fmt.Println()
			for name, status := range statuses {
				raw := fmt.Sprintf("%v", status["status"])
				display := statusDisplay[raw]
				if display == "" {
					display = raw
				}
				tag := "on-demand"
				if config.IsProviderDefault(name) {
					tag = "default"
				}
				fmt.Printf("  %-12s %-12s %s\n", name, display, tag)
			}
		}
		return nil
	},
}

var webSearchBudgetsCmd = &cobra.Command{
	Use:   "budgets",
	Short: "Show provider budget status",
	RunE: func(cmd *cobra.Command, args []string) error {
		b := newBroker()
		summary := b.BudgetSummary()
		fmt.Println("Provider budgets:")
		fmt.Printf("  %+v\n", summary)
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
		searchType, _ := cmd.Flags().GetString("search-type")
		asJSON, _ := cmd.Flags().GetBool("json")

		if provider == "exa" && searchType != "" {
			// Direct call to exa with custom search type
			p := providers.NewExaProvider()
			q := models.SearchQuery{
				Query:      query,
				Mode:       models.SearchModeDiscovery,
				MaxResults: 3,
			}
			results, trace, err := p.SearchWithType(q, searchType)
			if err != nil {
				return err
			}
			if asJSON {
				emitJSON(map[string]interface{}{
					"type":         searchType,
					"total_results": len(results),
					"latency_ms":   trace.LatencyMs,
					"results":      results,
				})
			} else {
				fmt.Printf("Exa search_type=%s  latency=%dms  results=%d\n", searchType, trace.LatencyMs, len(results))
				for i, r := range results {
					fmt.Printf("  %d. %s\n     %s\n", i+1, r.Title, r.URL)
					if i >= 4 {
						break
					}
				}
			}
			return nil
		}

		b := newBroker()

		pname := models.ProviderName(provider)
		statuses := b.GetAllProviderStatus()
		status, exists := statuses[provider]
		if !exists {
			return fmt.Errorf("provider not found: %s", provider)
		}

		if asJSON {
			fmt.Fprintf(os.Stderr, "Testing %s...\n", provider)
		} else {
			fmt.Printf("Testing %s...\n", provider)
			fmt.Printf("  Status: %v\n", status["status"])
		}

		q := models.SearchQuery{
			Query:      query,
			Mode:       models.SearchModeDiscovery,
			MaxResults: 3,
		}
		resp, err := b.Search(context.Background(), q)
		if err != nil {
			return err
		}

		if asJSON {
			emitJSON(map[string]interface{}{
				"provider":     provider,
				"total_results": resp.TotalResults,
				"results":      resp.Results,
			})
		} else {
			fmt.Printf("  Results: %d\n", resp.TotalResults)
			for i, r := range resp.Results {
				if r.Provider != nil && *r.Provider == pname {
					fmt.Printf("    - %s: %s\n", r.Title, r.URL)
				}
				if i >= 2 {
					break
				}
			}
		}
		return nil
	},
}

var webSearchKeyPoolCmd = &cobra.Command{
	Use:   "key-pool-status",
	Short: "Show API key pool status for all providers",
	RunE: func(cmd *cobra.Command, args []string) error {
		asJSON, _ := cmd.Flags().GetBool("json")

		providerNames := []string{"exa", "tavily", "serper", "you", "parallel", "linkup", "wolfram", "context7", "duckduckgo", "yahoo"}
		allStatus := map[string]interface{}{}

		for _, name := range providerNames {
			pool := providers.NewKeyPool(name)
			if pool.Count() > 0 {
				allStatus[name] = map[string]interface{}{
					"count":  pool.Count(),
					"keys":   pool.Status(),
				}
			}
		}

		if asJSON {
			emitJSON(allStatus)
		} else {
			for name, st := range allStatus {
				s := st.(map[string]interface{})
				rr := ""
				if config.IsRoundRobin(name) {
					rr = " [round-robin]"
				}
				fmt.Printf("%s:%s %d keys\n", name, rr, s["count"])
				for _, k := range s["keys"].([]map[string]interface{}) {
					masked := k["key"].(string)
					failures := k["failures"].(int)
					disabled := k["disabled"].(bool)
					cooldown := ""
					if cr, ok := k["cooldown_remaining"]; ok {
						cooldown = cr.(string)
					}
					status := "ready"
					if disabled {
						status = "disabled"
					} else if cooldown != "" && cooldown != "ready" {
						status = "cooling " + cooldown
					}
					fmt.Printf("  [%d] %s  failures=%d  status=%s\n", k["index"].(int), masked, failures, status)
				}
			}
		}
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

		pool := providers.NewKeyPool(provider)
		if err := pool.DisableKeyByIdx(idx); err != nil {
			return err
		}
		fmt.Printf("Disabled key [%d] for %s\n", idx, provider)
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

		pool := providers.NewKeyPool(provider)
		if err := pool.EnableKeyByIdx(idx); err != nil {
			return err
		}
		fmt.Printf("Enabled key [%d] for %s\n", idx, provider)
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
	webSearchCmd.Flags().String("caller", "cli", "Caller identifier for attribution")
	webSearchCmd.Flags().Bool("json", false, "Output as JSON")
	webSearchCmd.Flags().Bool("free", false, "Only use free (tier 0) providers")

	webSearchExtractCmd.Flags().Bool("json", false, "Output as JSON")
	webSearchCodeSearchCmd.Flags().Bool("json", false, "Output as JSON")
	webSearchCodeSearchCmd.Flags().Int("tokens", 0, "Token limit (0=auto)")
	webSearchDoctorCmd.Flags().Bool("json", false, "Output as JSON")
	webSearchTestProviderCmd.Flags().StringP("provider", "p", "", "Provider name")
	webSearchTestProviderCmd.Flags().StringP("query", "q", "aek test", "Test query")
	webSearchTestProviderCmd.Flags().String("search-type", "", "Exa search type: auto,fast,deep-lite,deep,deep-reasoning")
	webSearchTestProviderCmd.Flags().Bool("json", false, "Output as JSON")
}
