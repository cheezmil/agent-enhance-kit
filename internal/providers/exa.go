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
	client *http.Client
}

func NewExaProvider() *ExaProvider {
	return &ExaProvider{client: &http.Client{Timeout: time.Duration(config.ProviderTimeout("exa", 60)) * time.Second}}
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
	}
	if n := config.ProviderMaxResults("exa"); n > 0 {
		payload["numResults"] = n
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
			URL    string `json:"url"`
			Title  string `json:"title"`
			Text   string `json:"text"`
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

	req, err := http.NewRequest("POST", "https://api.exa.ai/contents", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("x-api-key", config.ReadKey("exa"))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}

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

	req, err := http.NewRequest("POST", "https://api.exa.ai/context", bytes.NewReader(body))
	if err != nil {
		return "", 0, 0, err
	}
	req.Header.Set("x-api-key", config.ReadKey("exa"))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", 0, 0, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return "", 0, 0, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}

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
