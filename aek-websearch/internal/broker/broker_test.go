package broker

import (
	"testing"

	"agent-enhance-kit/internal/models"
	"agent-enhance-kit/internal/providers"
)

type stubProvider struct{}

func (s stubProvider) Name() models.ProviderName { return models.ProviderDuckDuckGo }
func (s stubProvider) IsAvailable() bool { return true }
func (s stubProvider) Status() models.ProviderStatus { return models.ProviderStatusHealthy }
func (s stubProvider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	return []models.SearchResult{{URL: "https://example.com", Title: "Example", Provider: ptr(models.ProviderDuckDuckGo)}}, models.ProviderTrace{Provider: models.ProviderDuckDuckGo, Status: "success"}, nil
}

func ptr[T any](v T) *T { return &v }

func TestBrokerSearch(t *testing.T) {
	b := NewSearchBroker()
	b.RegisterProvider(stubProvider{})
	resp, err := b.Search(nil, models.SearchQuery{Query: "example", Mode: models.SearchModeDiscovery, MaxResults: 5})
	if err != nil {
		t.Fatalf("search failed: %v", err)
	}
	if resp == nil || len(resp.Results) != 1 {
		t.Fatalf("expected 1 result, got %#v", resp)
	}
}

var _ providers.Provider = stubProvider{}
