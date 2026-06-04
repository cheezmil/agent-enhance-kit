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

type ParallelProvider struct {
	client *http.Client
}

func NewParallelProvider() *ParallelProvider {
	return &ParallelProvider{client: &http.Client{Timeout: 15 * time.Second}}
}

func (p *ParallelProvider) Name() models.ProviderName { return "parallel" }
func (p *ParallelProvider) IsAvailable() bool          { return checkAvailable("parallel") }
func (p *ParallelProvider) Status() models.ProviderStatus { return checkStatus("parallel") }

func (p *ParallelProvider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	start := time.Now()
	trace := models.ProviderTrace{Provider: "parallel", Egress: "remote"}

	payload := map[string]interface{}{
		"objective":      query.Query,
		"search_queries": []string{query.Query},
		"max_results":    query.MaxResults,
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", "https://api.parallel.ai/v1beta/search", bytes.NewReader(body))
	if err != nil {
		trace.Status = "error"
		errMsg := err.Error()
		trace.Error = &errMsg
		return nil, trace, err
	}
	req.Header.Set("x-api-key", config.ReadKey("parallel"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("parallel-beta", "search-extract-2025-10-10")

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
			URL     string `json:"url"`
			Title   string `json:"title"`
			Excerpt string `json:"excerpt"`
			Snippet string `json:"snippet"`
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
		snippet := item.Excerpt
		if snippet == "" {
			snippet = item.Snippet
		}
		results = append(results, models.SearchResult{
			URL: item.URL, Title: item.Title, Snippet: snippet,
			Domain: domain, Provider: ptrProviderName("parallel"), RawRank: i,
		})
	}

	trace.Status = "success"
	trace.ResultsCount = len(results)
	trace.LatencyMs = int(time.Since(start).Milliseconds())
	return results, trace, nil
}
