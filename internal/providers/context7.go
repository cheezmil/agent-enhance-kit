package providers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"agent-enhance-kit/internal/models"
)

type Context7Provider struct {
	client *http.Client
}

func NewContext7Provider() *Context7Provider {
	return &Context7Provider{client: &http.Client{Timeout: 15 * time.Second}}
}

func (p *Context7Provider) Name() models.ProviderName { return "context7" }
func (p *Context7Provider) IsAvailable() bool          { return checkAvailableNoKey("context7") }
func (p *Context7Provider) Status() models.ProviderStatus { return checkStatusNoKey("context7") }

func (p *Context7Provider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	start := time.Now()
	trace := models.ProviderTrace{Provider: "context7", Egress: "remote"}

	apiURL := fmt.Sprintf("https://context7.com/api/v1/search?query=%s&limit=%d",
		url.QueryEscape(query.Query), query.MaxResults)

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		trace.Status = "error"
		errMsg := err.Error()
		trace.Error = &errMsg
		return nil, trace, err
	}

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
			ID          string `json:"id"`
			Title       string `json:"title"`
			Description string `json:"description"`
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
		if item.ID == "" {
			continue
		}
		results = append(results, models.SearchResult{
			URL: "https://context7.com" + item.ID, Title: item.Title, Snippet: item.Description,
			Domain: "context7.com", Provider: ptrProviderName("context7"), RawRank: i,
		})
	}

	trace.Status = "success"
	trace.ResultsCount = len(results)
	trace.LatencyMs = int(time.Since(start).Milliseconds())
	return results, trace, nil
}
