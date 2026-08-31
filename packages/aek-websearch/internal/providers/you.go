package providers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"

	"agent-enhance-kit/internal/config"
	"agent-enhance-kit/internal/models"
)

type YouProvider struct {
	do *KeyPoolDo
}

func NewYouProvider() *YouProvider {
	return &YouProvider{
		do: NewKeyPoolDo("you", buildHTTPClient("you", 60),
			func(apiKey string, query models.SearchQuery) (*http.Request, error) {
				countParam := ""
				if n := config.ProviderMaxResults("you"); n > 0 {
					countParam = fmt.Sprintf("&count=%d", n)
				}
				apiURL := fmt.Sprintf("https://api.you.com/v1/search?query=%s%s&safesearch=off",
					url.QueryEscape(query.Query), countParam)
				req, err := http.NewRequest("GET", apiURL, nil)
				if err != nil {
					return nil, err
				}
				req.Header.Set("X-API-Key", apiKey)
				return req, nil
			},
			func(body []byte, query models.SearchQuery) ([]models.SearchResult, error) {
				var data struct {
					Results struct {
						Web []struct {
							URL      string   `json:"url"`
							Title    string   `json:"title"`
							Snippets []string `json:"snippets"`
						} `json:"web"`
					} `json:"results"`
				}
				if err := json.Unmarshal(body, &data); err != nil {
					return nil, err
				}
				results := make([]models.SearchResult, 0, len(data.Results.Web))
				for i, item := range data.Results.Web {
					if item.URL == "" {
						continue
					}
					u, _ := url.Parse(item.URL)
					domain := ""
					if u != nil {
						domain = u.Hostname()
					}
					snippet := ""
					if len(item.Snippets) > 0 {
						snippet = item.Snippets[0]
					}
					results = append(results, models.SearchResult{
						URL: item.URL, Title: item.Title, Snippet: snippet,
						Domain: domain, Provider: ptrProviderName("you"), RawRank: i,
					})
				}
				return results, nil
			},
		),
	}
}

func (p *YouProvider) Name() models.ProviderName     { return "you" }
func (p *YouProvider) IsAvailable() bool             { return checkAvailable("you") }
func (p *YouProvider) Status() models.ProviderStatus  { return checkStatus("you") }
func (p *YouProvider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	return p.do.Do(query)
}
