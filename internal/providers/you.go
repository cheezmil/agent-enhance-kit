package providers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"agent-enhance-kit/internal/config"
	"agent-enhance-kit/internal/models"
)

type YouProvider struct {
	client *http.Client
}

func NewYouProvider() *YouProvider {
	return &YouProvider{client: &http.Client{Timeout: 15 * time.Second}}
}

func (p *YouProvider) Name() models.ProviderName { return "you" }
func (p *YouProvider) IsAvailable() bool          { return checkAvailable("you") }
func (p *YouProvider) Status() models.ProviderStatus { return checkStatus("you") }

func (p *YouProvider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	start := time.Now()
	trace := models.ProviderTrace{Provider: "you", Egress: "remote"}

	apiURL := fmt.Sprintf("https://api.you.com/v1/search?query=%s&count=%d&safesearch=off",
		url.QueryEscape(query.Query), query.MaxResults)

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		trace.Status = "error"
		errMsg := err.Error()
		trace.Error = &errMsg
		return nil, trace, err
	}
	req.Header.Set("X-API-Key", config.ReadKey("you"))

	resp, err := p.client.Do(req)
	if err != nil {
		trace.Status = "error"
		errMsg := err.Error()
		trace.Error = &errMsg
		return nil, trace, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		trace.Status = "error"
		errMsg := fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(respBody))
		trace.Error = &errMsg
		return nil, trace, fmt.Errorf("%s", errMsg)
	}

	var data struct {
		Results struct {
			Web []struct {
				URL      string   `json:"url"`
				Title    string   `json:"title"`
				Snippets []string `json:"snippets"`
			} `json:"web"`
		} `json:"results"`
	}
	if err := json.Unmarshal(respBody, &data); err != nil {
		trace.Status = "error"
		errMsg := err.Error()
		trace.Error = &errMsg
		return nil, trace, err
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

	trace.Status = "success"
	trace.ResultsCount = len(results)
	trace.LatencyMs = int(time.Since(start).Milliseconds())
	return results, trace, nil
}
