package providers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"agent-enhance-kit/internal/config"
	"agent-enhance-kit/internal/models"
)

type ExaProvider struct {
	client  *http.Client
	keyPool *KeyPool
}

func NewExaProvider() *ExaProvider {
	return &ExaProvider{
		client:  &http.Client{Timeout: time.Duration(config.ProviderTimeout("exa", 60)) * time.Second},
		keyPool: NewKeyPool("exa"),
	}
}

func (p *ExaProvider) Name() models.ProviderName { return "exa" }
func (p *ExaProvider) IsAvailable() bool          { return checkAvailable("exa") }
func (p *ExaProvider) Status() models.ProviderStatus { return checkStatus("exa") }

func (p *ExaProvider) SearchWithType(query models.SearchQuery, searchType string) ([]models.SearchResult, models.ProviderTrace, error) {
	start := time.Now()
	trace := models.ProviderTrace{Provider: "exa", Egress: "remote"}

	payload := map[string]interface{}{
		"query": query.Query,
		"type":  searchType,
		"contents": map[string]interface{}{
			"text": map[string]interface{}{
				"maxCharacters": 300,
			},
			"highlights": map[string]interface{}{
				"maxCharacters": 200,
			},
		},
	}
	if n := config.ProviderMaxResults("exa"); n > 0 {
		payload["numResults"] = n
	}
	body, _ := json.Marshal(payload)

	// Try each key in the pool with failover
	var lastErr error
	maxAttempts := p.keyPool.Count()
	if maxAttempts == 0 {
		maxAttempts = 1 // fallback to single key
	}

	for attempt := 0; attempt < maxAttempts; attempt++ {
		// Get next available key
		apiKey, err := p.keyPool.Next()
		if err != nil {
			return nil, trace, err
		}

		req, err := http.NewRequest("POST", "https://api.exa.ai/search", bytes.NewReader(body))
		if err != nil {
			trace.Status = "error"
			errMsg := err.Error()
			trace.Error = &errMsg
			return nil, trace, err
		}
		req.Header.Set("x-api-key", apiKey)
		req.Header.Set("Content-Type", "application/json")

		resp, err := p.client.Do(req)
		if err != nil {
			p.keyPool.ReportFailure(apiKey, false)
			lastErr = err
			continue
		}
		defer resp.Body.Close()

		respBody, _ := io.ReadAll(resp.Body)

		// Handle rate limits and errors
		if resp.StatusCode == 429 {
			p.keyPool.ReportFailure(apiKey, false)
			lastErr = fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
			continue
		}
		if resp.StatusCode == 402 {
			// Quota exhausted - permanent disable
			p.keyPool.ReportFailure(apiKey, true)
			lastErr = fmt.Errorf("HTTP %d: %s (key disabled: quota exhausted)", resp.StatusCode, string(respBody))
			continue
		}

		if resp.StatusCode != 200 {
			// Permanent error (auth, etc.) - disable this key
			p.keyPool.ReportFailure(apiKey, resp.StatusCode == 401 || resp.StatusCode == 403)
			lastErr = fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
			continue
		}

		// Success
		p.keyPool.ReportSuccess(apiKey)

		var data struct {
			Results []struct {
				URL        string   `json:"url"`
				Title      string   `json:"title"`
				Text       string   `json:"text"`
				Highlights []string `json:"highlights"`
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
			snippet := ""
			if len(item.Highlights) > 0 {
				snippet = item.Highlights[0]
			}
			if snippet == "" {
				snippet = item.Text
			}
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

	// All keys exhausted
	trace.Status = "error"
	errMsg := lastErr.Error()
	trace.Error = &errMsg
	return nil, trace, lastErr
}

func (p *ExaProvider) searchType() string {
	cfg := config.Load()
	if exa, ok := cfg.Providers["exa"]; ok && exa.SearchType != "" {
		return exa.SearchType
	}
	return "auto"
}

func (p *ExaProvider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	return p.SearchWithType(query, p.searchType())
}

// ExaContents fetches clean content for given URLs via /contents API.
func ExaContents(urls []string) (string, error) {
	payload := map[string]interface{}{
		"urls": urls,
		"contents": map[string]interface{}{
			"text": map[string]interface{}{
				"maxCharacters": 10000,
			},
		},
	}
	body, _ := json.Marshal(payload)

	pool := NewKeyPool("exa")
	maxAttempts := pool.Count()
	if maxAttempts == 0 {
		maxAttempts = 1
	}

	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		apiKey, err := pool.Next()
		if err != nil {
			return "", err
		}

		req, err := http.NewRequest("POST", "https://api.exa.ai/contents", bytes.NewReader(body))
		if err != nil {
			return "", err
		}
		req.Header.Set("x-api-key", apiKey)
		req.Header.Set("Content-Type", "application/json")

		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			pool.ReportFailure(apiKey, false)
			lastErr = err
			continue
		}
		defer resp.Body.Close()

		respBody, _ := io.ReadAll(resp.Body)
		if resp.StatusCode == 429 {
			pool.ReportFailure(apiKey, false)
			lastErr = fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
			continue
		}
		if resp.StatusCode == 402 {
			pool.ReportFailure(apiKey, true)
			lastErr = fmt.Errorf("HTTP %d: %s (key disabled: quota exhausted)", resp.StatusCode, string(respBody))
			continue
		}
		if resp.StatusCode != 200 {
			pool.ReportFailure(apiKey, resp.StatusCode == 401 || resp.StatusCode == 403)
			lastErr = fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
			continue
		}

		pool.ReportSuccess(apiKey)

		var data struct {
			Results []struct {
				URL     string `json:"url"`
				Title   string `json:"title"`
				Text    string `json:"text"`
				Summary string `json:"summary"`
			} `json:"results"`
		}
		if err := json.Unmarshal(respBody, &data); err != nil {
			return "", err
		}

		var out strings.Builder
		for _, r := range data.Results {
			if r.Title != "" {
				fmt.Fprintf(&out, "# %s\n\n", r.Title)
			}
			if r.URL != "" {
				fmt.Fprintf(&out, "URL: %s\n\n", r.URL)
			}
			if r.Summary != "" {
				fmt.Fprintf(&out, "Summary: %s\n\n", r.Summary)
			}
			if r.Text != "" {
				out.WriteString(r.Text)
				out.WriteString("\n\n---\n\n")
			}
		}
		return out.String(), nil
	}
	return "", lastErr
}

// ExaCodeContext searches for code snippets via /context API.
func ExaCodeContext(query string, tokens int) (string, int, float64, error) {
	tokensNum := "dynamic"
	if tokens > 0 {
		tokensNum = fmt.Sprintf("%d", tokens)
	}

	payload := map[string]interface{}{
		"query":     query,
		"tokensNum": tokensNum,
	}
	body, _ := json.Marshal(payload)

	pool := NewKeyPool("exa")
	maxAttempts := pool.Count()
	if maxAttempts == 0 {
		maxAttempts = 1
	}

	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		apiKey, err := pool.Next()
		if err != nil {
			return "", 0, 0, err
		}

		req, err := http.NewRequest("POST", "https://api.exa.ai/context", bytes.NewReader(body))
		if err != nil {
			return "", 0, 0, err
		}
		req.Header.Set("x-api-key", apiKey)
		req.Header.Set("Content-Type", "application/json")

		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			pool.ReportFailure(apiKey, false)
			lastErr = err
			continue
		}
		defer resp.Body.Close()

		respBody, _ := io.ReadAll(resp.Body)
		if resp.StatusCode == 429 {
			pool.ReportFailure(apiKey, false)
			lastErr = fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
			continue
		}
		if resp.StatusCode == 402 {
			pool.ReportFailure(apiKey, true)
			lastErr = fmt.Errorf("HTTP %d: %s (key disabled: quota exhausted)", resp.StatusCode, string(respBody))
			continue
		}
		if resp.StatusCode != 200 {
			pool.ReportFailure(apiKey, resp.StatusCode == 401 || resp.StatusCode == 403)
			lastErr = fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
			continue
		}

		pool.ReportSuccess(apiKey)

		var data struct {
			Response      string `json:"response"`
			ResultsCount  int    `json:"resultsCount"`
			CostDollars   string `json:"costDollars"`
			OutputTokens  int    `json:"outputTokens"`
		}
		if err := json.Unmarshal(respBody, &data); err != nil {
			return "", 0, 0, err
		}

		cost := 0.0
		fmt.Sscanf(data.CostDollars, "$%f", &cost)
		return data.Response, data.OutputTokens, cost, nil
	}
	return "", 0, 0, lastErr
}
