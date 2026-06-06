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

type LinkupProvider struct {
	client *http.Client
}

func NewLinkupProvider() *LinkupProvider {
	return &LinkupProvider{client: &http.Client{Timeout: time.Duration(config.ProviderTimeout("linkup", 60)) * time.Second}}
}

func (p *LinkupProvider) Name() models.ProviderName { return "linkup" }
func (p *LinkupProvider) IsAvailable() bool          { return checkAvailable("linkup") }
func (p *LinkupProvider) Status() models.ProviderStatus { return checkStatus("linkup") }

func (p *LinkupProvider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	start := time.Now()
	trace := models.ProviderTrace{Provider: "linkup", Egress: "remote"}

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
		trace.Status = "error"
		errMsg := err.Error()
		trace.Error = &errMsg
		return nil, trace, err
	}
	req.Header.Set("Authorization", "Bearer "+config.ReadKey("linkup"))
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
		SearchResults []struct {
			URL     string `json:"url"`
			Title   string `json:"name"`
			Snippet string `json:"description"`
		} `json:"searchResults"`
	}
	if err := json.Unmarshal(respBody, &data); err != nil {
		trace.Status = "error"
		errMsg := err.Error()
		trace.Error = &errMsg
		return nil, trace, err
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

	trace.Status = "success"
	trace.ResultsCount = len(results)
	trace.LatencyMs = int(time.Since(start).Milliseconds())
	return results, trace, nil
}
