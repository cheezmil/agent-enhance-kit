package providers

import "agent-enhance-kit/internal/models"

// YahooProvider 是一个最小可用骨架。
type YahooProvider struct{}

func NewYahooProvider() *YahooProvider { return &YahooProvider{} }
func (p *YahooProvider) Name() models.ProviderName { return models.ProviderYahoo }
func (p *YahooProvider) IsAvailable() bool { return false }
func (p *YahooProvider) Status() models.ProviderStatus { return models.ProviderStatusUnavailableMissingKey }
func (p *YahooProvider) Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error) {
	return nil, models.ProviderTrace{Provider: models.ProviderYahoo, Status: "skipped", Egress: "local"}, nil
}
