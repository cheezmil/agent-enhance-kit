package broker

import (
	"context"
	"fmt"
	"sync"
	"time"

	"agent-enhance-kit/internal/config"
	"agent-enhance-kit/internal/models"
	"agent-enhance-kit/internal/persistence"
	"agent-enhance-kit/internal/providers"
	"agent-enhance-kit/internal/sessions"
)

// SearchBroker handles search routing, caching, and provider execution.
type SearchBroker struct {
	providers map[models.ProviderName]providers.Provider
	cache     *SearchCache
	health    *HealthTracker
	budgets   *BudgetTracker
	sessions  *sessions.Store
	mu        sync.RWMutex
}

// NewSearchBroker creates a new SearchBroker.
func NewSearchBroker() *SearchBroker {
	return &SearchBroker{
		providers: make(map[models.ProviderName]providers.Provider),
		cache:     NewSearchCache(),
		health:    NewHealthTracker(),
		budgets:   NewBudgetTracker(),
		sessions:  sessions.NewStore(),
	}
}

// NewSearchBrokerWithPersistence creates a new SearchBroker with persistence.
func NewSearchBrokerWithPersistence(p *persistence.Store) *SearchBroker {
	return &SearchBroker{
		providers: make(map[models.ProviderName]providers.Provider),
		cache:     NewSearchCache(),
		health:    NewHealthTracker(),
		budgets:   NewBudgetTrackerWithPersistence(p),
		sessions:  sessions.NewStoreWithPersistence(p),
	}
}

// RegisterProvider registers a search provider.
func (b *SearchBroker) RegisterProvider(p providers.Provider) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.providers[p.Name()] = p
}

// Search executes a search query.
func (b *SearchBroker) Search(ctx context.Context, query models.SearchQuery) (*models.SearchResponse, error) {
	// Check cache.
	if cached := b.cache.Get(query); cached != nil {
		return cached, nil
	}

	// Resolve provider order.
	providerOrder := b.resolveRouting(query)

	// Execute search across providers concurrently.
	type providerOutcome struct {
		results []models.SearchResult
		trace   models.ProviderTrace
	}
	outcomes := make([]providerOutcome, 0, len(providerOrder))
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, providerName := range providerOrder {
		providerName := providerName
		provider, exists := b.providers[providerName]
		if !exists {
			continue
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			if !provider.IsAvailable() {
				mu.Lock()
				outcomes = append(outcomes, providerOutcome{trace: models.ProviderTrace{Provider: providerName, Status: "skipped", Egress: "local"}})
				mu.Unlock()
				return
			}
			providerResults, trace, err := provider.Search(query)
			if err != nil {
				trace.Status = "error"
				errMsg := err.Error()
				trace.Error = &errMsg
				b.health.RecordFailure(providerName)
			} else {
				trace.Status = "success"
				b.health.RecordSuccess(providerName)
			}
			mu.Lock()
			outcomes = append(outcomes, providerOutcome{results: providerResults, trace: trace})
			mu.Unlock()
		}()
	}
	wg.Wait()

	var results []models.SearchResult
	var traces []models.ProviderTrace
	for _, outcome := range outcomes {
		traces = append(traces, outcome.trace)
		results = append(results, outcome.results...)
	}
	
	// Apply RRF ranking (configurable).
	var rankedResults []models.SearchResult
	if config.Load().RRF {
		rankedResults = b.applyRRF(results, providerOrder)
	} else {
		rankedResults = results
	}

	// Deduplicate.
	dedupedResults := b.deduplicate(rankedResults)
	
	// Truncate to max results (0 = no limit).
	if query.MaxResults > 0 && len(dedupedResults) > query.MaxResults {
		dedupedResults = dedupedResults[:query.MaxResults]
	}
	
	// Build response.
	response := &models.SearchResponse{
		Query:        query.Query,
		Mode:         query.Mode,
		Results:      dedupedResults,
		Traces:       traces,
		TotalResults: len(dedupedResults),
		Cached:       false,
		CreatedAt:    time.Now(),
	}
	
	// Cache response.
	b.cache.Set(query, response)
	
	return response, nil
}

// SearchWithSession 执行带会话的搜索，并记录查询历史。
func (b *SearchBroker) SearchWithSession(ctx context.Context, query models.SearchQuery, sessionID string) (*models.SearchResponse, error) {
	resp, err := b.Search(ctx, query)
	if err != nil {
		return nil, err
	}
	if sessionID != "" {
		b.sessions.CreateSession(sessionID)
		if _, addErr := b.sessions.AddQuery(sessionID, query.Query, string(query.Mode), len(resp.Results)); addErr == nil {
			resp.SessionID = &sessionID
		}
	}
	return resp, nil
}

// Sessions 返回会话存储。
func (b *SearchBroker) Sessions() *sessions.Store { return b.sessions }

// resolveRouting determines the order of providers to try.
func (b *SearchBroker) resolveRouting(query models.SearchQuery) []models.ProviderName {
	// If providers are explicitly specified via -p, use them.
	if len(query.Providers) > 0 {
		return query.Providers
	}

	// Use all registered providers that have default=true in settings.jsonc.
	var order []models.ProviderName
	for name := range b.providers {
		if config.IsProviderDefault(string(name)) {
			order = append(order, name)
		}
	}
	if len(order) > 0 {
		return order
	}

	// Fallback: all registered providers.
	for name := range b.providers {
		order = append(order, name)
	}
	return order
}

// applyRRF applies Reciprocal Rank Fusion to merge results.
func (b *SearchBroker) applyRRF(results []models.SearchResult, providerOrder []models.ProviderName) []models.SearchResult {
	// Group results by URL.
	urlScores := make(map[string]float64)
	urlResults := make(map[string]models.SearchResult)
	
	for _, result := range results {
		url := result.URL
		if _, exists := urlScores[url]; !exists {
			urlScores[url] = 0
			urlResults[url] = result
		}
		
		// Calculate RRF score.
		// For simplicity, use a basic ranking based on provider order.
		for i, provider := range providerOrder {
			if result.Provider != nil && *result.Provider == provider {
				// RRF formula: 1 / (k + rank)
				k := 60
				rank := i + 1
				score := 1.0 / float64(k+rank)
				urlScores[url] += score
				break
			}
		}
	}
	
	// Convert to slice and sort by score.
	var ranked []models.SearchResult
	for url, score := range urlScores {
		result := urlResults[url]
		result.Score = score
		ranked = append(ranked, result)
	}
	
	// Sort by score descending.
	for i := 0; i < len(ranked); i++ {
		for j := i + 1; j < len(ranked); j++ {
			if ranked[j].Score > ranked[i].Score {
				ranked[i], ranked[j] = ranked[j], ranked[i]
			}
		}
	}
	
	return ranked
}

// deduplicate removes duplicate URLs.
func (b *SearchBroker) deduplicate(results []models.SearchResult) []models.SearchResult {
	seen := make(map[string]bool)
	var deduped []models.SearchResult
	
	for _, result := range results {
		if !seen[result.URL] {
			seen[result.URL] = true
			deduped = append(deduped, result)
		}
	}
	
	return deduped
}

// GetProviderStatus returns the status of a provider.
func (b *SearchBroker) GetProviderStatus(providerName models.ProviderName) map[string]interface{} {
	b.mu.RLock()
	defer b.mu.RUnlock()
	
	provider, exists := b.providers[providerName]
	if !exists {
		return map[string]interface{}{
			"provider": providerName,
			"status":   "unknown",
		}
	}
	
	return map[string]interface{}{
		"provider": providerName,
		"status":   provider.Status(),
		"health":   b.health.GetHealth(providerName),
		"budget":   b.budgets.GetBudget(providerName),
	}
}

// GetAllProviderStatus returns status for all registered providers.
func (b *SearchBroker) GetAllProviderStatus() map[string]map[string]interface{} {
	b.mu.RLock()
	defer b.mu.RUnlock()
	result := make(map[string]map[string]interface{}, len(b.providers))
	for name, provider := range b.providers {
		result[string(name)] = map[string]interface{}{
			"provider": name,
			"status":   provider.Status(),
			"health":   b.health.GetHealth(name),
			"budget":   b.budgets.GetBudget(name),
		}
	}
	return result
}

// HealthSummary returns a minimal health summary.
func (b *SearchBroker) HealthSummary() map[string]any {
	return map[string]any{"status": "ok", "providers": len(b.providers)}
}

// BudgetSummary returns a minimal budget summary.
func (b *SearchBroker) BudgetSummary() map[string]any {
	return map[string]any{"providers": len(b.providers)}
}

// SearchCache implements a simple in-memory cache.
type SearchCache struct {
	cache map[string]*models.SearchResponse
	mu    sync.RWMutex
}

// NewSearchCache creates a new search cache.
func NewSearchCache() *SearchCache {
	return &SearchCache{
		cache: make(map[string]*models.SearchResponse),
	}
}

// Get retrieves a cached response.
func (c *SearchCache) Get(query models.SearchQuery) *models.SearchResponse {
	c.mu.RLock()
	defer c.mu.RUnlock()
	
	key := c.generateKey(query)
	return c.cache[key]
}

// Set stores a response in the cache.
func (c *SearchCache) Set(query models.SearchQuery, response *models.SearchResponse) {
	c.mu.Lock()
	defer c.mu.Unlock()
	
	key := c.generateKey(query)
	c.cache[key] = response
}

// generateKey generates a cache key for a query.
func (c *SearchCache) generateKey(query models.SearchQuery) string {
	return fmt.Sprintf("%s:%s:%d", query.Query, query.Mode, query.MaxResults)
}

// HealthTracker tracks provider health.
type HealthTracker struct {
	health map[models.ProviderName]*HealthStatus
	mu     sync.RWMutex
}

// HealthStatus represents the health status of a provider.
type HealthStatus struct {
	Failures    int
	LastFailure time.Time
	LastSuccess time.Time
}

// NewHealthTracker creates a new health tracker.
func NewHealthTracker() *HealthTracker {
	return &HealthTracker{
		health: make(map[models.ProviderName]*HealthStatus),
	}
}

// RecordFailure records a failure for a provider.
func (h *HealthTracker) RecordFailure(provider models.ProviderName) {
	h.mu.Lock()
	defer h.mu.Unlock()
	
	status, exists := h.health[provider]
	if !exists {
		status = &HealthStatus{}
		h.health[provider] = status
	}
	
	status.Failures++
	status.LastFailure = time.Now()
}

// RecordSuccess records a success for a provider.
func (h *HealthTracker) RecordSuccess(provider models.ProviderName) {
	h.mu.Lock()
	defer h.mu.Unlock()
	
	status, exists := h.health[provider]
	if !exists {
		status = &HealthStatus{}
		h.health[provider] = status
	}
	
	status.Failures = 0
	status.LastSuccess = time.Now()
}

// GetHealth returns the health status of a provider.
func (h *HealthTracker) GetHealth(provider models.ProviderName) *HealthStatus {
	h.mu.RLock()
	defer h.mu.RUnlock()
	
	return h.health[provider]
}
