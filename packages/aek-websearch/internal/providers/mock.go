package providers

import "agent-enhance-kit/internal/models"

// MockProvider 提供本地可用的测试 provider。
type MockProvider struct{}

func NewMockProvider() *MockProvider { return &MockProvider{} }
func (p *MockProvider) Name() models.ProviderName { return models.ProviderCache }
func (p *MockProvider) IsAvailable() bool { return true }
func (p *MockProvider) Status() models.ProviderStatus { return models.ProviderStatusHealthy }
func (p *MockProvider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	result := models.SearchResult{URL: "https://example.com", Title: query.Query, Snippet: "mock result", Provider: ptr(models.ProviderCache), Domain: "example.com"}
	return []models.SearchResult{result}, models.ProviderTrace{Provider: models.ProviderCache, Status: "success", ResultsCount: 1, Egress: "local"}, nil
}
