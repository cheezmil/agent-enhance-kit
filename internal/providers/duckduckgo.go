package providers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"time"

	"agent-enhance-kit/internal/models"
)

// DuckDuckGoProvider implements the Provider interface for DuckDuckGo.
type DuckDuckGoProvider struct {
	client *http.Client
}

// NewDuckDuckGoProvider creates a new DuckDuckGo provider.
func NewDuckDuckGoProvider() *DuckDuckGoProvider {
	return &DuckDuckGoProvider{
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

// Name returns the provider name.
func (p *DuckDuckGoProvider) Name() models.ProviderName {
	return models.ProviderDuckDuckGo
}

// IsAvailable checks if the provider is available.
func (p *DuckDuckGoProvider) IsAvailable() bool {
	return os.Getenv("AEK_DUCKDUCKGO_ENABLED") == "true"
}

// Status returns the provider status.
func (p *DuckDuckGoProvider) Status() models.ProviderStatus {
	if os.Getenv("AEK_DUCKDUCKGO_ENABLED") != "true" {
		return models.ProviderStatusDisabledByConfig
	}
	return models.ProviderStatusHealthy
}

// Search executes a search on DuckDuckGo.
func (p *DuckDuckGoProvider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	start := time.Now()
	trace := models.ProviderTrace{
		Provider: models.ProviderDuckDuckGo,
		Egress:   "local",
	}

	// Build search URL.
	searchURL := fmt.Sprintf("https://html.duckduckgo.com/html/?q=%s", url.QueryEscape(query.Query))

	// Create request.
	req, err := http.NewRequest("GET", searchURL, nil)
	if err != nil {
		trace.Status = "error"
		errMsg := err.Error()
		trace.Error = &errMsg
		return nil, trace, err
	}

	// Set user agent to avoid blocking.
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")

	// Execute request.
	resp, err := p.client.Do(req)
	if err != nil {
		trace.Status = "error"
		errMsg := err.Error()
		trace.Error = &errMsg
		return nil, trace, err
	}
	defer resp.Body.Close()

	// Parse HTML response (simplified - in reality we'd parse HTML).
	// For now, return empty results.
	results := []models.SearchResult{}
	if instant, err := p.searchInstantAnswer(query.Query); err == nil && instant != nil {
		if instant.AbstractURL != "" {
			results = append(results, models.SearchResult{
				URL:      instant.AbstractURL,
				Title:    instant.Heading,
				Snippet:  instant.Abstract,
				Provider: ptr(models.ProviderDuckDuckGo),
				Domain:   extractDomain(instant.AbstractURL),
			})
		}
	}
	trace.Status = "success"
	trace.LatencyMs = int(time.Since(start).Milliseconds())
	trace.ResultsCount = len(results)

	return results, trace, nil
}

// DuckDuckGoInstantAnswer represents the instant answer API response.
type DuckDuckGoInstantAnswer struct {
	Abstract    string `json:"Abstract"`
	AbstractURL string `json:"AbstractURL"`
	Heading     string `json:"Heading"`
	Result      string `json:"Result"`
}

// searchInstantAnswer uses the instant answer API.
func (p *DuckDuckGoProvider) searchInstantAnswer(query string) (*DuckDuckGoInstantAnswer, error) {
	apiURL := fmt.Sprintf("https://api.duckduckgo.com/?q=%s&format=json", url.QueryEscape(query))
	resp, err := p.client.Get(apiURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result DuckDuckGoInstantAnswer
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

func ptr[T any](v T) *T { return &v }

func extractDomain(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return u.Hostname()
}
