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

type SerperProvider struct {
	client *http.Client
}

func NewSerperProvider() *SerperProvider {
	return &SerperProvider{client: &http.Client{Timeout: time.Duration(config.ProviderTimeout("serper", 60)) * time.Second}}
}

func (p *SerperProvider) Name() models.ProviderName { return "serper" }
func (p *SerperProvider) IsAvailable() bool          { return checkAvailable("serper") }
func (p *SerperProvider) Status() models.ProviderStatus { return checkStatus("serper") }

func (p *SerperProvider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	start := time.Now()
	trace := models.ProviderTrace{Provider: "serper", Egress: "remote"}

	payload := map[string]interface{}{"q": query.Query}
	if n := config.ProviderMaxResults("serper"); n > 0 {
		payload["num"] = n
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", "https://google.serper.dev/search", bytes.NewReader(body))
	if err != nil {
		trace.Status = "error"
		errMsg := err.Error()
		trace.Error = &errMsg
		return nil, trace, err
	}
	req.Header.Set("X-API-KEY", config.ReadKey("serper"))
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
		Organic []struct {
			Link    string `json:"link"`
			Title   string `json:"title"`
			Snippet string `json:"snippet"`
		} `json:"organic"`
	}
	if err := json.Unmarshal(respBody, &data); err != nil {
		trace.Status = "error"
		errMsg := err.Error()
		trace.Error = &errMsg
		return nil, trace, err
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

	trace.Status = "success"
	trace.ResultsCount = len(results)
	trace.LatencyMs = int(time.Since(start).Milliseconds())
	return results, trace, nil
}
