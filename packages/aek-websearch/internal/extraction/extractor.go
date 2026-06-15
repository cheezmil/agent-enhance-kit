package extraction

import (
	"context"
	"io"
	"net/http"
	"time"

	"agent-enhance-kit/internal/models"
)

// Extractor defines the interface for content extractors.
type Extractor interface {
	// Name returns the extractor name.
	Name() string
	
	// Extract extracts content from a URL.
	Extract(ctx context.Context, url string) (*models.ExtractedContent, error)
	
	// IsAvailable checks if the extractor is available.
	IsAvailable() bool
}

// HTTPExtractor implements a simple HTTP-based extractor.
type HTTPExtractor struct {
	client *http.Client
}

// NewHTTPExtractor creates a new HTTP extractor.
func NewHTTPExtractor() *HTTPExtractor {
	return &HTTPExtractor{
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

// Name returns the extractor name.
func (e *HTTPExtractor) Name() string {
	return "http"
}

// IsAvailable checks if the extractor is available.
func (e *HTTPExtractor) IsAvailable() bool {
	return true
}

// Extract extracts content from a URL using HTTP GET.
func (e *HTTPExtractor) Extract(ctx context.Context, url string) (*models.ExtractedContent, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
	
	resp, err := e.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	
	content := &models.ExtractedContent{
		URL:           url,
		Title:         resp.Header.Get("Title"),
		Text:          string(body),
		WordCount:     len(string(body)),
		Egress:        "local",
		SourceType:    "http",
		IsComplete:    true,
		CompletenessConfidence: 0.8,
	}
	
	return content, nil
}

// ExtractorChain implements a fallback chain of extractors.
type ExtractorChain struct {
	extractors []Extractor
}

// NewExtractorChain creates a new extractor chain.
func NewExtractorChain() *ExtractorChain {
	return &ExtractorChain{
		extractors: []Extractor{
			NewHTTPExtractor(),
		},
	}
}

// AddExtractor adds an extractor to the chain.
func (c *ExtractorChain) AddExtractor(extractor Extractor) {
	c.extractors = append(c.extractors, extractor)
}

// Extract tries each extractor in order until one succeeds.
func (c *ExtractorChain) Extract(ctx context.Context, url string) (*models.ExtractedContent, error) {
	for _, extractor := range c.extractors {
		if !extractor.IsAvailable() {
			continue
		}
		
		content, err := extractor.Extract(ctx, url)
		if err == nil && content != nil {
			return content, nil
		}
	}
	
	// Return a default content if all extractors fail.
	return &models.ExtractedContent{
		URL:           url,
		Title:         "Extraction Failed",
		Text:          "Failed to extract content from URL",
		WordCount:     0,
		Egress:        "local",
		SourceType:    "fallback",
		IsComplete:    false,
		CompletenessConfidence: 0.0,
	}, nil
}

// DefaultExtractorChain creates a default extractor chain with all available extractors.
func DefaultExtractorChain() *ExtractorChain {
	chain := NewExtractorChain()
	
	// Add more extractors here as they are implemented.
	// chain.AddExtractor(NewTrafilaturaExtractor())
	// chain.AddExtractor(NewCrawl4AIExtractor())
	// chain.AddExtractor(NewPlaywrightExtractor())
	// chain.AddExtractor(NewJinaExtractor())
	// chain.AddExtractor(NewValyuExtractor())
	// chain.AddExtractor(NewFirecrawlExtractor())
	// chain.AddExtractor(NewYouExtractor())
	// chain.AddExtractor(NewWaybackExtractor())
	// chain.AddExtractor(NewArchiveExtractor())
	
	return chain
}