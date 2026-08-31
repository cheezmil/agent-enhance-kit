package providers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"

	"agent-enhance-kit/internal/models"
)

type WolframProvider struct {
	do *KeyPoolDo
}

func NewWolframProvider() *WolframProvider {
	return &WolframProvider{
		do: NewKeyPoolDo("wolfram", buildHTTPClient("wolfram", 60),
			func(apiKey string, query models.SearchQuery) (*http.Request, error) {
				apiURL := fmt.Sprintf("https://api.wolframalpha.com/v2/query?input=%s&appid=%s&output=json",
					url.QueryEscape(query.Query), url.QueryEscape(apiKey))
				req, err := http.NewRequest("GET", apiURL, nil)
				if err != nil {
					return nil, err
				}
				return req, nil
			},
			func(body []byte, query models.SearchQuery) ([]models.SearchResult, error) {
				var data struct {
					QueryResult struct {
						Success bool `json:"success"`
						Pods    []struct {
							Title   string `json:"title"`
							Primary bool   `json:"primary"`
							SubPods []struct {
								Plaintext string `json:"plaintext"`
							} `json:"subpods"`
						} `json:"pods"`
					} `json:"queryresult"`
				}
				if err := json.Unmarshal(body, &data); err != nil {
					return nil, err
				}
				var results []models.SearchResult
				if data.QueryResult.Success {
					for _, pod := range data.QueryResult.Pods {
						if pod.Primary && len(pod.SubPods) > 0 {
							text := pod.SubPods[0].Plaintext
							if text != "" {
								results = append(results, models.SearchResult{
									URL:      fmt.Sprintf("https://www.wolframalpha.com/input?i=%s", url.QueryEscape(query.Query)),
									Title:    fmt.Sprintf("WolframAlpha: %s", pod.Title),
									Snippet:  text,
									Domain:   "wolframalpha.com",
									Provider: ptrProviderName("wolfram"),
								})
							}
						}
					}
				}
				if results == nil {
					results = []models.SearchResult{}
				}
				return results, nil
			},
		),
	}
}

func (p *WolframProvider) Name() models.ProviderName     { return "wolfram" }
func (p *WolframProvider) IsAvailable() bool             { return checkAvailable("wolfram") }
func (p *WolframProvider) Status() models.ProviderStatus { return checkStatus("wolfram") }
func (p *WolframProvider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	return p.do.Do(query)
}
