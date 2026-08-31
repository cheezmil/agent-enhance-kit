package providers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/url"

	"agent-enhance-kit/internal/config"
	"agent-enhance-kit/internal/models"
)

type ParallelProvider struct {
	do *KeyPoolDo
}

func NewParallelProvider() *ParallelProvider {
	return &ParallelProvider{
		do: NewKeyPoolDo("parallel", buildHTTPClient("parallel", 60),
			func(apiKey string, query models.SearchQuery) (*http.Request, error) {
				payload := map[string]interface{}{
					"objective":      query.Query,
					"search_queries": []string{query.Query},
				}
				if n := config.ProviderMaxResults("parallel"); n > 0 {
					payload["max_results"] = n
				}
				body, _ := json.Marshal(payload)
				req, err := http.NewRequest("POST", "https://api.parallel.ai/v1beta/search", bytes.NewReader(body))
				if err != nil {
					return nil, err
				}
				req.Header.Set("x-api-key", apiKey)
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("parallel-beta", "search-extract-2025-10-10")
				return req, nil
			},
			func(body []byte, query models.SearchQuery) ([]models.SearchResult, error) {
				var data struct {
					Results []struct {
						URL     string `json:"url"`
						Title   string `json:"title"`
						Excerpt string `json:"excerpt"`
						Snippet string `json:"snippet"`
					} `json:"results"`
				}
				if err := json.Unmarshal(body, &data); err != nil {
					return nil, err
				}
				results := make([]models.SearchResult, 0, len(data.Results))
				for i, item := range data.Results {
					if item.URL == "" {
						continue
					}
					u, _ := url.Parse(item.URL)
					domain := ""
					if u != nil {
						domain = u.Hostname()
					}
					snippet := item.Excerpt
					if snippet == "" {
						snippet = item.Snippet
					}
					results = append(results, models.SearchResult{
						URL: item.URL, Title: item.Title, Snippet: snippet,
						Domain: domain, Provider: ptrProviderName("parallel"), RawRank: i,
					})
				}
				return results, nil
			},
		),
	}
}

func (p *ParallelProvider) Name() models.ProviderName     { return "parallel" }
func (p *ParallelProvider) IsAvailable() bool             { return checkAvailable("parallel") }
func (p *ParallelProvider) Status() models.ProviderStatus { return checkStatus("parallel") }
func (p *ParallelProvider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	return p.do.Do(query)
}
