package providers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/url"

	"agent-enhance-kit/internal/config"
	"agent-enhance-kit/internal/models"
)

type LinkupProvider struct {
	do *KeyPoolDo
}

func NewLinkupProvider() *LinkupProvider {
	return &LinkupProvider{
		do: NewKeyPoolDo("linkup", buildHTTPClient("linkup", 60),
			func(apiKey string, query models.SearchQuery) (*http.Request, error) {
				payload := map[string]interface{}{
					"q":          query.Query,
					"depth":      "standard",
					"outputType": "searchResults",
				}
				if n := config.ProviderMaxResults("linkup"); n > 0 {
					payload["maxResults"] = n
				}
				body, _ := json.Marshal(payload)
				req, err := http.NewRequest("POST", "https://api.linkup.so/v1/search", bytes.NewReader(body))
				if err != nil {
					return nil, err
				}
				req.Header.Set("Authorization", "Bearer "+apiKey)
				req.Header.Set("Content-Type", "application/json")
				return req, nil
			},
			func(body []byte, query models.SearchQuery) ([]models.SearchResult, error) {
				var data struct {
					SearchResults []struct {
						URL     string `json:"url"`
						Title   string `json:"name"`
						Snippet string `json:"description"`
					} `json:"searchResults"`
				}
				if err := json.Unmarshal(body, &data); err != nil {
					return nil, err
				}
				results := make([]models.SearchResult, 0, len(data.SearchResults))
				for i, item := range data.SearchResults {
					if item.URL == "" {
						continue
					}
					u, _ := url.Parse(item.URL)
					domain := ""
					if u != nil {
						domain = u.Hostname()
					}
					results = append(results, models.SearchResult{
						URL: item.URL, Title: item.Title, Snippet: item.Snippet,
						Domain: domain, Provider: ptrProviderName("linkup"), RawRank: i,
					})
				}
				return results, nil
			},
		),
	}
}

func (p *LinkupProvider) Name() models.ProviderName     { return "linkup" }
func (p *LinkupProvider) IsAvailable() bool             { return checkAvailable("linkup") }
func (p *LinkupProvider) Status() models.ProviderStatus { return checkStatus("linkup") }
func (p *LinkupProvider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	return p.do.Do(query)
}
