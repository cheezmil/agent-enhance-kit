package providers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"

	"agent-enhance-kit/internal/models"
)

// TavilyProvider implements Tavily search API.
type TavilyProvider struct {
	client *http.Client
	apiKey string
}

func NewTavilyProvider() *TavilyProvider {
	return &TavilyProvider{
		client: &http.Client{Timeout: 20 * time.Second},
		apiKey: os.Getenv("AEK_TAVILY_API_KEY"),
	}
}

func (p *TavilyProvider) Name() models.ProviderName { return "tavily" }

func (p *TavilyProvider) IsAvailable() bool {
	return os.Getenv("AEK_TAVILY_ENABLED") == "true" && p.apiKey != ""
}

func (p *TavilyProvider) Status() models.ProviderStatus {
	if os.Getenv("AEK_TAVILY_ENABLED") != "true" {
		return models.ProviderStatusDisabledByConfig
	}
	if p.apiKey == "" {
		return models.ProviderStatusUnavailableMissingKey
	}
	return models.ProviderStatusEnabled
}

func (p *TavilyProvider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	start := time.Now()
	trace := models.ProviderTrace{Provider: "tavily", Egress: "remote"}

	payload := map[string]interface{}{
		"api_key":     p.apiKey,
		"query":       query.Query,
		"max_results": query.MaxResults,
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
			URL:      item.URL,
			Title:    item.Title,
			Snippet:  item.Content,
			Domain:   domain,
			Provider: ptrProviderName("tavily"),
			Score:    item.Score,
			RawRank:  i,
		})
	}

	trace.Status = "success"
	trace.ResultsCount = len(results)
	trace.LatencyMs = int(time.Since(start).Milliseconds())
	return results, trace, nil
}
