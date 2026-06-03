package api

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"agent-enhance-kit/internal/auth"
	"agent-enhance-kit/internal/broker"
	"agent-enhance-kit/internal/config"
	"agent-enhance-kit/internal/extraction"
	"agent-enhance-kit/internal/persistence"
	"agent-enhance-kit/internal/ratelimit"
	"agent-enhance-kit/internal/models"
	"agent-enhance-kit/internal/providers"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

// Run starts the HTTP server.
func Run() error {
	godotenv.Load()
	cfg := config.Load()
	authCfg := auth.Load()
	r := gin.Default()
	r.Use(authMiddleware(authCfg))
	limiter := ratelimit.New()
	r.Use(func(c *gin.Context) {
		if !limiter.Allow(c.ClientIP() + c.FullPath()) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded"})
			return
		}
		c.Next()
	})
	persist := persistence.NewStore("aek-data.json")
	if err := persist.Load(); err != nil {
		return err
	}
	b := broker.NewSearchBrokerWithPersistence(persist)
	b.RegisterProvider(providers.NewDuckDuckGoProvider())
	b.RegisterProvider(providers.NewMockProvider())
	b.RegisterProvider(providers.NewYahooProvider())
	b.RegisterProvider(providers.NewSerperProvider())
	b.RegisterProvider(providers.NewTavilyProvider())
	b.RegisterProvider(providers.NewExaProvider())
	b.RegisterProvider(providers.NewLinkupProvider())
	b.RegisterProvider(providers.NewWolframProvider())
	b.RegisterProvider(providers.NewYouProvider())
	b.RegisterProvider(providers.NewParallelProvider())
	b.RegisterProvider(providers.NewContext7Provider())
	chain := extraction.DefaultExtractorChain()

	r.GET("/api/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "version": "aek-dev"})
	})

	r.GET("/api/admin/health/detail", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "providers": b.GetAllProviderStatus()})
	})

	r.GET("/api/admin/budgets", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"budgets": b.BudgetSummary()})
	})

	r.POST("/api/search", func(c *gin.Context) {
		var req struct {
			Query      string   `json:"query"`
			Mode       string   `json:"mode"`
			MaxResults int      `json:"max_results"`
			Providers  []string `json:"providers"`
			SessionID  string   `json:"session_id"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if req.MaxResults <= 0 {
			req.MaxResults = cfg.DefaultMaxResults
		}
		providersList := make([]models.ProviderName, 0, len(req.Providers))
		for _, p := range req.Providers {
			providersList = append(providersList, models.ProviderName(p))
		}
		query := models.SearchQuery{Query: req.Query, Mode: models.SearchMode(req.Mode), MaxResults: req.MaxResults, Providers: providersList}
		resp, err := b.SearchWithSession(context.Background(), query, req.SessionID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, resp)
	})

	r.POST("/api/extract", func(c *gin.Context) {
		var req struct{ URL string `json:"url"` }
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		content, err := chain.Extract(ctx, req.URL)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, content)
	})

	return r.Run(cfg.BindHost + ":" + strconv.Itoa(cfg.Port))
}
