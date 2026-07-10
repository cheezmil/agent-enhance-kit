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

type WolframProvider struct {
	client *http.Client
}

func NewWolframProvider() *WolframProvider {
	return &WolframProvider{client: &http.Client{Timeout: time.Duration(config.ProviderTimeout("wolfram", 60)) * time.Second}}
}

func (p *WolframProvider) Name() models.ProviderName { return "wolfram" }
func (p *WolframProvider) IsAvailable() bool          { return checkAvailable("wolfram") }
func (p *WolframProvider) Status() models.ProviderStatus { return checkStatus("wolfram") }

func (p *WolframProvider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	start := time.Now()
	trace := models.ProviderTrace{Provider: "wolfram", Egress: "remote"}

	apiURL := fmt.Sprintf("https://api.wolframalpha.com/v2/query?input=%s&appid=%s&output=json",
		url.QueryEscape(query.Query), url.QueryEscape(config.ReadKey("wolfram")))

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
		QueryResult struct {
			Success bool `json:"success"`
			Pods    []struct {
				Title   string `json:"title"`
				Primary bool   `json:"primary"`
				SubPods []struct {
					Plaintext string `json:"plaintext"`
				} `json:"subpods"`
			} `json:"pods"`
		} `json:"queryresult"`
	}
	if err := json.Unmarshal(respBody, &data); err != nil {
		trace.Status = "error"
		errMsg := err.Error()
		trace.Error = &errMsg
		return nil, trace, err
	}

	var results []models.SearchResult
	if data.QueryResult.Success {
		for _, pod := range data.QueryResult.Pods {
			if pod.Primary && len(pod.SubPods) > 0 {
				text := pod.SubPods[0].Plaintext
				if text != "" {
					results = append(results, models.SearchResult{
						URL:      fmt.Sprintf("https://www.wolframalpha.com/input?i=%s", url.QueryEscape(query.Query)),
						Title:    fmt.Sprintf("WolframAlpha: %s", pod.Title),
						Snippet:  text,
						Domain:   "wolframalpha.com",
						Provider: ptrProviderName("wolfram"),
					})
				}
			}
		}
	}
	if results == nil {
		results = []models.SearchResult{}
	}

	trace.Status = "success"
	trace.ResultsCount = len(results)
	trace.LatencyMs = int(time.Since(start).Milliseconds())
	return results, trace, nil
}
