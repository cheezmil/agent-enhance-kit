package models

import (
	"time"
)

// SearchMode represents the search mode.
type SearchMode string

const (
	SearchModeRecovery  SearchMode = "recovery"
	SearchModeDiscovery SearchMode = "discovery"
	SearchModeGrounding SearchMode = "grounding"
	SearchModeResearch  SearchMode = "research"
)

// ProviderName represents the name of a search provider.
type ProviderName string

const (
	ProviderSearXNG    ProviderName = "searxng"
	ProviderDuckDuckGo ProviderName = "duckduckgo"
	ProviderYahoo      ProviderName = "yahoo"
	ProviderBrave      ProviderName = "brave"
	ProviderSerper     ProviderName = "serper"
	ProviderTavily     ProviderName = "tavily"
	ProviderExa        ProviderName = "exa"
	ProviderSearchAPI  ProviderName = "searchapi"
	ProviderYou        ProviderName = "you"
	ProviderParallel   ProviderName = "parallel"
	ProviderLinkup     ProviderName = "linkup"
	ProviderValyu      ProviderName = "valyu"
	ProviderGitHub     ProviderName = "github"
	ProviderWolfram    ProviderName = "wolfram"
	ProviderContext7   ProviderName = "context7"
	ProviderCache      ProviderName = "cache"
)

// ProviderStatus represents the status of a provider.
type ProviderStatus string

const (
	ProviderStatusEnabled             ProviderStatus = "enabled"
	ProviderStatusDisabledByConfig    ProviderStatus = "disabled_by_config"
	ProviderStatusUnavailableMissingKey ProviderStatus = "unavailable_missing_key"
	ProviderStatusTemporarilyDisabled ProviderStatus = "temporarily_disabled_after_failures"
	ProviderStatusBudgetExhausted     ProviderStatus = "budget_exhausted"
	ProviderStatusDegraded            ProviderStatus = "degraded"
	ProviderStatusHealthy             ProviderStatus = "healthy"
)

// SearchQuery represents a search request from a caller.
type SearchQuery struct {
	Query      string            `json:"query"`
	Mode       SearchMode        `json:"mode"`
	MaxResults int               `json:"max_results"`
	Providers  []ProviderName    `json:"providers,omitempty"`
	FreeOnly   bool              `json:"free_only"`
	Caller     string            `json:"caller"`
	Metadata   map[string]any    `json:"metadata,omitempty"`
}

// SearchResult represents a normalized search result.
type SearchResult struct {
	URL              string             `json:"url"`
	Title            string             `json:"title"`
	Snippet          string             `json:"snippet"`
	Domain           string             `json:"domain"`
	Provider         *ProviderName      `json:"provider,omitempty"`
	Score            float64            `json:"score"`
	RawRank          int                `json:"raw_rank"`
	Metadata         map[string]any     `json:"metadata,omitempty"`
	ScoreAttribution map[string]float64 `json:"score_attribution,omitempty"`
}

// ProviderTrace represents metadata about a single provider call.
type ProviderTrace struct {
	Provider        ProviderName `json:"provider"`
	Status          string       `json:"status"`
	ResultsCount    int          `json:"results_count"`
	LatencyMs       int          `json:"latency_ms"`
	Error           *string      `json:"error,omitempty"`
	BudgetRemaining *float64     `json:"budget_remaining,omitempty"`
	CreditInfo      map[string]any `json:"credit_info,omitempty"`
	Egress          string       `json:"egress"`
}

// SearchResponse represents the complete response from the broker.
type SearchResponse struct {
	Query          string          `json:"query"`
	Mode           SearchMode      `json:"mode"`
	Results        []SearchResult  `json:"results"`
	Traces         []ProviderTrace `json:"traces,omitempty"`
	TotalResults   int             `json:"total_results"`
	Cached         bool            `json:"cached"`
	SessionID      *string         `json:"session_id,omitempty"`
	SearchRunID    *string         `json:"search_run_id,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	BudgetWarnings []string        `json:"budget_warnings,omitempty"`
}

// ExtractedContent represents extracted content from a URL.
type ExtractedContent struct {
	URL           string    `json:"url"`
	Title         string    `json:"title"`
	Text          string    `json:"text"`
	Author        string    `json:"author,omitempty"`
	Date          string    `json:"date,omitempty"`
	WordCount     int       `json:"word_count"`
	Egress        string    `json:"egress"`
	Machine       string    `json:"machine,omitempty"`
	SourceType    string    `json:"source_type"`
	IsComplete    bool      `json:"is_complete"`
	CompletenessConfidence float64 `json:"completeness_confidence"`
	TruncationType string   `json:"truncation_type,omitempty"`
}
