package providers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/url"

	"agent-enhance-kit/internal/config"
	"agent-enhance-kit/internal/models"
)

type SerperProvider struct {
	do *KeyPoolDo
}

func NewSerperProvider() *SerperProvider {
	return &SerperProvider{
		do: NewKeyPoolDo("serper", buildHTTPClient("serper", 60),
			func(apiKey string, query models.SearchQuery) (*http.Request, error) {
				payload := map[string]interface{}{"q": query.Query}
				if n := config.ProviderMaxResults("serper"); n > 0 {
					payload["num"] = n
				}
				body, _ := json.Marshal(payload)
				req, err := http.NewRequest("POST", "https://google.serper.dev/search", bytes.NewReader(body))
				if err != nil {
					return nil, err
				}
				req.Header.Set("X-API-KEY", apiKey)
				req.Header.Set("Content-Type", "application/json")
				return req, nil
			},
			func(body []byte, query models.SearchQuery) ([]models.SearchResult, error) {
				var data struct {
					Organic []struct {
						Link    string `json:"link"`
						Title   string `json:"title"`
						Snippet string `json:"snippet"`
					} `json:"organic"`
				}
				if err := json.Unmarshal(body, &data); err != nil {
					return nil, err
				}
				results := make([]models.SearchResult, 0, len(data.Organic))
				for i, item := range data.Organic {
					if item.Link == "" {
						continue
					}
					u, _ := url.Parse(item.Link)
					domain := ""
					if u != nil {
						domain = u.Hostname()
					}
					results = append(results, models.SearchResult{
						URL: item.Link, Title: item.Title, Snippet: item.Snippet,
						Domain: domain, Provider: ptrProviderName("serper"), RawRank: i,
					})
				}
				return results, nil
			},
		),
	}
}

func (p *SerperProvider) Name() models.ProviderName     { return "serper" }
func (p *SerperProvider) IsAvailable() bool              { return checkAvailable("serper") }
func (p *SerperProvider) Status() models.ProviderStatus  { return checkStatus("serper") }
func (p *SerperProvider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	return p.do.Do(query)
}
