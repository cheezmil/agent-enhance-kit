package middleware

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/cheezmil/aek-mcp/internal/config"
	"github.com/cheezmil/aek-mcp/internal/services"
)

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if config.AppConfig.SkipAuth {
			c.Set("user", &map[string]interface{}{
				"username": "guest",
				"role":     "admin",
			})
			c.Set("username", "guest")
			c.Next()
			return
		}

		// 1. Check Bearer key authentication
		tokenString := c.GetHeader("Authorization")
		if tokenString != "" {
			cleanToken := strings.TrimPrefix(tokenString, "Bearer ")

			// Check against bearer keys
			for _, bk := range services.Store.GetAllBearerKeys() {
				if !bk.Enabled {
					continue
				}
				if subtle.ConstantTimeCompare([]byte(bk.Key), []byte(cleanToken)) == 1 {
					c.Set("user", &map[string]interface{}{
						"username": "bearer",
						"role":     "admin",
					})
					c.Set("username", "bearer")
					c.Set("bearerKey", bk)
					c.Next()
					return
				}
			}

			// 2. Check JWT token
			token, err := jwt.Parse(cleanToken, func(token *jwt.Token) (interface{}, error) {
				return []byte(config.AppConfig.JWTSecret), nil
			})

			if err == nil && token.Valid {
				claims, ok := token.Claims.(jwt.MapClaims)
				if ok {
					username, _ := claims["username"].(string)
					role, _ := claims["role"].(string)
					c.Set("user", &map[string]interface{}{
						"username": username,
						"role":     role,
					})
					c.Set("username", username)
					c.Next()
					return
				}
			}
		}

		// 3. Check x-auth-token header or ?token= query
		xAuthToken := c.GetHeader("X-Auth-Token")
		if xAuthToken == "" {
			xAuthToken = c.Query("token")
		}
		if xAuthToken != "" {
			token, err := jwt.Parse(xAuthToken, func(token *jwt.Token) (interface{}, error) {
				return []byte(config.AppConfig.JWTSecret), nil
			})
			if err == nil && token.Valid {
				claims, ok := token.Claims.(jwt.MapClaims)
				if ok {
					username, _ := claims["username"].(string)
					role, _ := claims["role"].(string)
					c.Set("user", &map[string]interface{}{
						"username": username,
						"role":     role,
					})
					c.Set("username", username)
					c.Next()
					return
				}
			}
		}

		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "Authentication required"})
		c.Abort()
	}
}

func AdminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		user, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "Access denied"})
			c.Abort()
			return
		}
		userMap, ok := user.(*map[string]interface{})
		if !ok {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "Access denied"})
			c.Abort()
			return
		}
		role, _ := (*userMap)["role"].(string)
		if role != "admin" {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "Admin access required"})
			c.Abort()
			return
		}
		c.Next()
	}
}
