package providers

import (
	"agent-enhance-kit/internal/config"
	"agent-enhance-kit/internal/models"
)

// Provider defines the interface for search provider adapters.
type Provider interface {
	// Name returns the unique provider identifier.
	Name() models.ProviderName

	// IsAvailable checks if this provider is configured and ready to use.
	IsAvailable() bool

	// Status returns the current operational status.
	Status() models.ProviderStatus

	// Search executes a search and returns normalized results with trace metadata.
	Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error)
}

// checkAvailable returns IsAvailable for a provider that needs a key.
func checkAvailable(name string) bool {
	return config.IsProviderEnabled(name) && config.ReadKey(name) != ""
}

// checkStatus returns ProviderStatus for a provider that needs a key.
func checkStatus(name string) models.ProviderStatus {
	if !config.IsProviderEnabled(name) {
		return models.ProviderStatusDisabledByConfig
	}
	if config.ReadKey(name) == "" {
		return models.ProviderStatusUnavailableMissingKey
	}
	return models.ProviderStatusEnabled
}

// checkAvailableNoKey returns IsAvailable for a provider that needs no key.
func checkAvailableNoKey(name string) bool {
	return config.IsProviderEnabled(name)
}

// checkStatusNoKey returns ProviderStatus for a provider that needs no key.
func checkStatusNoKey(name string) models.ProviderStatus {
	if !config.IsProviderEnabled(name) {
		return models.ProviderStatusDisabledByConfig
	}
	return models.ProviderStatusEnabled
}

func ptrProviderName(n models.ProviderName) *models.ProviderName { return &n }
