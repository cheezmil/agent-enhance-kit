package providers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"agent-enhance-kit/internal/config"
	"agent-enhance-kit/internal/models"
)

type DuckDuckGoProvider struct {
	client *http.Client
}

func NewDuckDuckGoProvider() *DuckDuckGoProvider {
	return &DuckDuckGoProvider{client: &http.Client{Timeout: time.Duration(config.ProviderTimeout("duckduckgo", 60)) * time.Second}}
}

func (p *DuckDuckGoProvider) Name() models.ProviderName { return models.ProviderDuckDuckGo }
func (p *DuckDuckGoProvider) IsAvailable() bool          { return checkAvailableNoKey("duckduckgo") }
func (p *DuckDuckGoProvider) Status() models.ProviderStatus { return checkStatusNoKey("duckduckgo") }

func (p *DuckDuckGoProvider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	start := time.Now()
	trace := models.ProviderTrace{Provider: models.ProviderDuckDuckGo, Egress: "local"}

	results := []models.SearchResult{}
	if instant, err := p.searchInstantAnswer(query.Query); err == nil && instant != nil {
		if instant.AbstractURL != "" {
			results = append(results, models.SearchResult{
				URL: instant.AbstractURL, Title: instant.Heading, Snippet: instant.Abstract,
				Provider: ptr(models.ProviderDuckDuckGo), Domain: extractDomain(instant.AbstractURL),
			})
		}
	}

	trace.Status = "success"
	trace.LatencyMs = int(time.Since(start).Milliseconds())
	trace.ResultsCount = len(results)
	return results, trace, nil
}

type DuckDuckGoInstantAnswer struct {
	Abstract    string `json:"Abstract"`
	AbstractURL string `json:"AbstractURL"`
	Heading     string `json:"Heading"`
}

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
