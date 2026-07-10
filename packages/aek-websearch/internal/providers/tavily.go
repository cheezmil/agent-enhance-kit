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

type TavilyProvider struct {
	client *http.Client
}

func NewTavilyProvider() *TavilyProvider {
	return &TavilyProvider{client: &http.Client{Timeout: time.Duration(config.ProviderTimeout("tavily", 60)) * time.Second}}
}

func (p *TavilyProvider) Name() models.ProviderName { return "tavily" }
func (p *TavilyProvider) IsAvailable() bool          { return checkAvailable("tavily") }
func (p *TavilyProvider) Status() models.ProviderStatus { return checkStatus("tavily") }

func (p *TavilyProvider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	start := time.Now()
	trace := models.ProviderTrace{Provider: "tavily", Egress: "remote"}

	payload := map[string]interface{}{
		"api_key": config.ReadKey("tavily"),
		"query":   query.Query,
	}
	if n := config.ProviderMaxResults("tavily"); n > 0 {
		payload["max_results"] = n
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", "https://api.tavily.com/search", bytes.NewReader(body))
	if err != nil {
		trace.Status = "error"
		errMsg := err.Error()
		trace.Error = &errMsg
		return nil, trace, err
	}
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
			URL     string  `json:"url"`
			Title   string  `json:"title"`
			Content string  `json:"content"`
			Score   float64 `json:"score"`
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
		results = append(results, models.SearchResult{
			URL: item.URL, Title: item.Title, Snippet: item.Content,
			Domain: domain, Provider: ptrProviderName("tavily"), Score: item.Score, RawRank: i,
		})
	}

	trace.Status = "success"
	trace.ResultsCount = len(results)
	trace.LatencyMs = int(time.Since(start).Milliseconds())
	return results, trace, nil
}
