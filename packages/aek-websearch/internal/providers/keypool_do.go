package providers

import (
	"fmt"
	"io"
	"net/http"
	"time"

	"agent-enhance-kit/internal/config"
	"agent-enhance-kit/internal/models"
)
// KeyPoolDo is the shared failover engine for every API-key provider.
// It wraps a provider's per-key request construction and response parsing
// around the KeyPool retry/cooldown/permanent-disable loop, so every provider
// gets multi-key failover — not just exa.
type KeyPoolDo struct {
	name         string
	client       *http.Client
	pool         *KeyPool
	buildRequest func(apiKey string, query models.SearchQuery) (*http.Request, error)
	parse        func(body []byte, query models.SearchQuery) ([]models.SearchResult, error)
}

// NewKeyPoolDo builds a failover-enabled search executor for a provider.
//
//	name         provider id, used for the key file (~/.aek/websearch/<name>.txt) and config.
//	client       the provider's HTTP client.
//	buildRequest builds an *http.Request for one specific apiKey + query.
//	parse        parses a 2xx response body into normalized results.
func NewKeyPoolDo(name string, client *http.Client,
	buildRequest func(apiKey string, query models.SearchQuery) (*http.Request, error),
	parse func(body []byte, query models.SearchQuery) ([]models.SearchResult, error)) *KeyPoolDo {
	return &KeyPoolDo{
		name:         name,
		client:       client,
		pool:         NewKeyPool(name),
		buildRequest: buildRequest,
		parse:        parse,
	}
}

// classifyStatus maps an HTTP status code to how the key pool should treat it.
//   - permanent=true  → the key is permanently disabled (auth/quota errors, persist to disk).
//   - permanent=false → the key is cooled down (rate limit / transient) and failover continues.
func classifyStatus(status int) bool {
	switch status {
	case 401, 403, 402, 432:
		// 401/403 auth, 402/432 quota/plan exhausted → key is permanently bad.
		return true
	default:
		// 429 and any other non-2xx → transient, cooldown and try next key.
		return false
	}
}

// Do runs the search with automatic key-pool failover and returns normalized
// results plus trace metadata. It mirrors the (previously exa-only) loop.
func (d *KeyPoolDo) Do(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	start := time.Now()
	trace := models.ProviderTrace{Provider: models.ProviderName(d.name), Egress: "remote"}

	pool := d.pool
	maxAttempts := pool.Count()
	if maxAttempts == 0 {
		maxAttempts = 1 // fallback to single key
	}

	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		apiKey, err := pool.Next()
		if err != nil {
			return nil, trace, err
		}

		req, err := d.buildRequest(apiKey, query)
		if err != nil {
			trace.Status = "error"
			errMsg := err.Error()
			trace.Error = &errMsg
			return nil, trace, err
		}

		resp, err := d.client.Do(req)
		if err != nil {
			pool.ReportFailure(apiKey, false)
			lastErr = err
			continue
		}
		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			permanent := classifyStatus(resp.StatusCode)
			pool.ReportFailure(apiKey, permanent)
			lastErr = fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
			continue
		}

		pool.ReportSuccess(apiKey)

		results, err := d.parse(respBody, query)
		if err != nil {
			trace.Status = "error"
			errMsg := err.Error()
			trace.Error = &errMsg
			return nil, trace, err
		}

		trace.Status = "success"
		trace.ResultsCount = len(results)
		trace.LatencyMs = int(time.Since(start).Milliseconds())
		return results, trace, nil
	}

	trace.Status = "error"
	if lastErr == nil {
		lastErr = fmt.Errorf("%s: all API keys exhausted", d.name)
	}
	errMsg := lastErr.Error()
	trace.Error = &errMsg
	return nil, trace, lastErr
}

// buildHTTPClient creates the provider HTTP client with the configured timeout.
func buildHTTPClient(name string, defaultTimeout int) *http.Client {
	return &http.Client{Timeout: time.Duration(config.ProviderTimeout(name, defaultTimeout)) * time.Second}
}
