package providers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/url"

	"agent-enhance-kit/internal/config"
	"agent-enhance-kit/internal/models"
)

type TavilyProvider struct {
	do *KeyPoolDo
}

func NewTavilyProvider() *TavilyProvider {
	return &TavilyProvider{
		do: NewKeyPoolDo("tavily", buildHTTPClient("tavily", 60),
			func(apiKey string, query models.SearchQuery) (*http.Request, error) {
				payload := map[string]interface{}{
					"api_key": apiKey,
					"query":   query.Query,
				}
				if n := config.ProviderMaxResults("tavily"); n > 0 {
					payload["max_results"] = n
				}
				body, _ := json.Marshal(payload)
				req, err := http.NewRequest("POST", "https://api.tavily.com/search", bytes.NewReader(body))
				if err != nil {
					return nil, err
				}
				req.Header.Set("Content-Type", "application/json")
				return req, nil
			},
			func(body []byte, query models.SearchQuery) ([]models.SearchResult, error) {
				var data struct {
					Results []struct {
						URL     string  `json:"url"`
						Title   string  `json:"title"`
						Content string  `json:"content"`
						Score   float64 `json:"score"`
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
					results = append(results, models.SearchResult{
						URL: item.URL, Title: item.Title, Snippet: item.Content,
						Domain: domain, Provider: ptrProviderName("tavily"), Score: item.Score, RawRank: i,
					})
				}
				return results, nil
			},
		),
	}
}

func (p *TavilyProvider) Name() models.ProviderName          { return "tavily" }
func (p *TavilyProvider) IsAvailable() bool                   { return checkAvailable("tavily") }
func (p *TavilyProvider) Status() models.ProviderStatus      { return checkStatus("tavily") }
func (p *TavilyProvider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	return p.do.Do(query)
}