// Package commands contains the shared business logic for all aek-websearch
// sub-commands. Both the CLI (cobra) and MCP server call into this package,
// so adding a new command here automatically makes it available on both sides.
package commands

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"agent-enhance-kit/internal/broker"
	"agent-enhance-kit/internal/config"
	"agent-enhance-kit/internal/models"
	"agent-enhance-kit/internal/persistence"
	"agent-enhance-kit/internal/providers"
)

// ── shared helpers ──────────────────────────────────────────────────────────

var statusDisplay = map[string]string{
	"enabled":                             "OK",
	"disabled_by_config":                  "DISABLED (config)",
	"unavailable_missing_key":             "MISSING KEY",
	"temporarily_disabled_after_failures": "COOLDOWN",
	"budget_exhausted":                    "BUDGET EXHAUSTED",
	"degraded":                            "DEGRADED",
	"healthy":                             "HEALTHY",
}

func newBroker() *broker.SearchBroker {
	persist := persistence.NewStore("aek-data.json")
	_ = persist.Load()
	b := broker.NewSearchBrokerWithPersistence(persist)
	b.RegisterProvider(providers.NewDuckDuckGoProvider())
	b.RegisterProvider(providers.NewMockProvider())
	b.RegisterProvider(providers.NewYahooProvider())
	b.RegisterProvider(providers.NewSerperProvider())
	b.RegisterProvider(providers.NewTavilyProvider())
	b.RegisterProvider(providers.NewExaProvider())
	b.RegisterProvider(providers.NewLinkupProvider())
	b.RegisterProvider(providers.NewWolframProvider())
	b.RegisterProvider(providers.NewYouProvider())
	b.RegisterProvider(providers.NewParallelProvider())
	b.RegisterProvider(providers.NewContext7Provider())
	return b
}

// DefaultBroker returns the default broker (for callers that don't bring their own).
func DefaultBroker() *broker.SearchBroker { return newBroker() }

// ── Search ─────────────────────────────────────────────────────────────────

// SearchInput holds parameters for a web search.
type SearchInput struct {
	Query      string
	Mode       string   // default "discovery"
	Providers  []string // nil = use config defaults
	MaxResults int      // 0 → 10
	SessionID  string
}

// SearchOutput is the result of a search command.
type SearchOutput struct {
	Text   string // Human-readable formatted text
	JSON   string // JSON of models.SearchResponse
	Traces []models.ProviderTrace
}

// Search executes a web search and returns formatted output.
func Search(b *broker.SearchBroker, input SearchInput) (*SearchOutput, error) {
	if input.Mode == "" {
		input.Mode = "discovery"
	}
	if input.MaxResults <= 0 {
		input.MaxResults = 10
	}

	var providersList []models.ProviderName
	for _, p := range input.Providers {
		p = strings.TrimSpace(p)
		if p != "" {
			providersList = append(providersList, models.ProviderName(p))
		}
	}

	sq := models.SearchQuery{
		Query:      input.Query,
		Mode:       models.SearchMode(input.Mode),
		MaxResults: input.MaxResults,
		Providers:  providersList,
	}

	var resp *models.SearchResponse
	var err error
	ctx := context.Background()
	if input.SessionID != "" {
		resp, err = b.SearchWithSession(ctx, sq, input.SessionID)
	} else {
		resp, err = b.Search(ctx, sq)
	}
	if err != nil {
		return nil, err
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Search: %q (mode=%s, results=%d)\n\n", resp.Query, resp.Mode, resp.TotalResults))

	for i, r := range resp.Results {
		provider := ""
		if r.Provider != nil {
			provider = fmt.Sprintf("[%s] ", *r.Provider)
		}
		snippet := r.Snippet
		meta := ""
		if r.Metadata != nil {
			if pub, ok := r.Metadata["publishedDate"].(string); ok && pub != "" && pub != "null" {
				meta += "   Published: " + pub + "\n"
			}
			if auth, ok := r.Metadata["author"].(string); ok && auth != "" && auth != "null" {
				meta += "   Author: " + auth + "\n"
			}
		}
		sb.WriteString(fmt.Sprintf("%d. %s%s\n   %s\n   %s\n%s\n", i+1, provider, r.Title, r.URL, snippet, meta))
	}

	if len(resp.Traces) > 0 {
		for _, t := range resp.Traces {
			errMsg := ""
			if t.Error != nil {
				errMsg = " err=" + *t.Error
			}
			sb.WriteString(fmt.Sprintf("  %s: %s %d results %dms%s\n", t.Provider, t.Status, t.ResultsCount, t.LatencyMs, errMsg))
		}
	}
	if len(resp.BudgetWarnings) > 0 {
		for _, w := range resp.BudgetWarnings {
			sb.WriteString(fmt.Sprintf("  budget: %s\n", w))
		}
	}

	jsonData, _ := json.MarshalIndent(resp, "", "  ")
	return &SearchOutput{Text: sb.String(), JSON: string(jsonData), Traces: resp.Traces}, nil
}

// ── Extract ────────────────────────────────────────────────────────────────

// Extract fetches clean text content from a URL via Exa Contents API.
func Extract(url string) (string, error) {
	return providers.ExaContents([]string{url})
}

// ── CodeSearch ─────────────────────────────────────────────────────────────

// CodeSearchOutput is the result of a code search.
type CodeSearchOutput struct {
	Response     string
	OutputTokens int
	CostDollars  float64
}

// CodeSearch searches code snippets via Exa Code Context API.
func CodeSearch(query string, tokens int) (*CodeSearchOutput, error) {
	response, outputTokens, costDollars, err := providers.ExaCodeContext(query, tokens)
	if err != nil {
		return nil, err
	}
	return &CodeSearchOutput{
		Response:     response,
		OutputTokens: outputTokens,
		CostDollars:  costDollars,
	}, nil
}

// ── Doctor ─────────────────────────────────────────────────────────────────

// Doctor diagnoses provider setup.
func Doctor(b *broker.SearchBroker) (string, error) {
	cfg := config.Load()
	statuses := b.GetAllProviderStatus()

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Config: port=%d\n", cfg.Port))

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
	sb.WriteString(fmt.Sprintf("Providers: %d ready, %d need API keys\n\n", ready, needsKey))

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
		sb.WriteString(fmt.Sprintf("  %-12s %-12s %s\n", name, display, tag))
	}
	return sb.String(), nil
}

// ── Budgets ────────────────────────────────────────────────────────────────

// Budgets returns provider budget summary.
func Budgets(b *broker.SearchBroker) (string, error) {
	summary := b.BudgetSummary()
	data, _ := json.MarshalIndent(summary, "", "  ")
	return string(data), nil
}

// ── TestProvider ───────────────────────────────────────────────────────────

// TestProvider smoke-tests a single provider.
func TestProvider(b *broker.SearchBroker, provider, query string) (string, error) {
	if query == "" {
		query = "aek test"
	}

	pname := models.ProviderName(provider)
	statuses := b.GetAllProviderStatus()
	status, exists := statuses[provider]
	if !exists {
		return "", fmt.Errorf("provider not found: %s", provider)
	}

	sq := models.SearchQuery{
		Query:      query,
		Mode:       models.SearchModeDiscovery,
		MaxResults: 3,
	}
	resp, err := b.Search(context.Background(), sq)
	if err != nil {
		return "", err
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Testing %s... status=%v\n", provider, status["status"]))
	sb.WriteString(fmt.Sprintf("Results: %d\n", resp.TotalResults))
	for i, r := range resp.Results {
		if r.Provider != nil && *r.Provider == pname {
			sb.WriteString(fmt.Sprintf("  - %s: %s\n", r.Title, r.URL))
		}
		if i >= 2 {
			break
		}
	}
	return sb.String(), nil
}

// ── KeyPoolStatus ──────────────────────────────────────────────────────────

// KeyPoolStatus returns API key pool status for all providers.
func KeyPoolStatus() (string, error) {
	providerNames := []string{"exa", "tavily", "serper", "you", "parallel", "linkup", "wolfram", "context7", "duckduckgo", "yahoo"}

	var sb strings.Builder
	for _, name := range providerNames {
		pool := providers.NewKeyPool(name)
		if pool.Count() > 0 {
			rr := ""
			if config.IsRoundRobin(name) {
				rr = " [round-robin]"
			}
			sb.WriteString(fmt.Sprintf("%s:%s %d keys\n", name, rr, pool.Count()))
			for _, k := range pool.Status() {
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
				sb.WriteString(fmt.Sprintf("  [%d] %s failures=%d status=%s\n", k["index"].(int), masked, failures, status))
			}
		}
	}
	if sb.Len() == 0 {
		sb.WriteString("No API keys configured.\n")
	}
	return sb.String(), nil
}

// ── KeyPoolDisable ─────────────────────────────────────────────────────────

// KeyPoolDisable permanently disables an API key by index.
func KeyPoolDisable(provider string, index int) (string, error) {
	pool := providers.NewKeyPool(provider)
	if err := pool.DisableKeyByIdx(index); err != nil {
		return "", err
	}
	return fmt.Sprintf("Disabled key [%d] for %s\n", index, provider), nil
}

// ── KeyPoolEnable ──────────────────────────────────────────────────────────

// KeyPoolEnable re-enables a disabled API key by index.
func KeyPoolEnable(provider string, index int) (string, error) {
	pool := providers.NewKeyPool(provider)
	if err := pool.EnableKeyByIdx(index); err != nil {
		return "", err
	}
	return fmt.Sprintf("Enabled key [%d] for %s\n", index, provider), nil
}
