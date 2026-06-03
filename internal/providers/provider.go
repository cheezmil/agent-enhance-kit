package providers

import (
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