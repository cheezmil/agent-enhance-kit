package providers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"agent-enhance-kit/internal/config"
	"agent-enhance-kit/internal/models"
)

type ExaProvider struct {
	client *http.Client
}

func NewExaProvider() *ExaProvider {
	return &ExaProvider{client: &http.Client{Timeout: 20 * time.Second}}
}

func (p *ExaProvider) Name() models.ProviderName { return "exa" }
func (p *ExaProvider) IsAvailable() bool          { return checkAvailable("exa") }
func (p *ExaProvider) Status() models.ProviderStatus { return checkStatus("exa") }

func (p *ExaProvider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	start := time.Now()
	trace := models.ProviderTrace{Provider: "exa", Egress: "remote"}

	payload := map[string]interface{}{
		"query":      query.Query,
		"numResults": query.MaxResults,
		"type":       "auto",
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", "https://api.exa.ai/search", bytes.NewReader(body))
	if err != nil {
		trace.Status = "error"
		errMsg := err.Error()
		trace.Error = &errMsg
		return nil, trace, err
	}
	req.Header.Set("x-api-key", config.ReadKey("exa"))
	req.Header.Set("Content-Type", "application/json")

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
		Results []struct {
			URL   string `json:"url"`
			Title string `json:"title"`
			Text  string `json:"text"`
		} `json:"results"`
	}
	if err := json.Unmarshal(respBody, &data); err != nil {
		trace.Status = "error"
		errMsg := err.Error()
		trace.Error = &errMsg
		return nil, trace, err
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
		snippet := item.Text
		if len(snippet) > 300 {
			snippet = snippet[:300]
		}
		results = append(results, models.SearchResult{
			URL: item.URL, Title: item.Title, Snippet: snippet,
			Domain: domain, Provider: ptrProviderName("exa"), RawRank: i,
		})
	}

	trace.Status = "success"
	trace.ResultsCount = len(results)
	trace.LatencyMs = int(time.Since(start).Milliseconds())
	return results, trace, nil
}
