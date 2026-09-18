package api

import (
	"net/http"
	"strings"

	"agent-enhance-kit/internal/auth"
	"github.com/gin-gonic/gin"
)

// authMiddleware 对非本地访问做 API key 保护。
func authMiddleware(cfg auth.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		if auth.IsLocalClient(c.ClientIP()) {
			c.Next()
			return
		}
		token := auth.ExtractToken(c.GetHeader("Authorization"), c.GetHeader("X-API-Key"), c.GetHeader("X-Admin-API-Key"))
		if strings.HasPrefix(path, "/api/admin/") {
			if cfg.AdminAPIKey == "" || token != cfg.AdminAPIKey {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "admin authentication required"})
				return
			}
			c.Next()
			return
		}
		if cfg.CallerAPIKey == "" || token != cfg.CallerAPIKey {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}
		c.Next()
	}
}
