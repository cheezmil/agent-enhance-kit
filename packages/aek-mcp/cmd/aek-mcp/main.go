package main

import (
	"context"
	"crypto/subtle"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/cheezmil/aek-mcp/internal/config"
	"github.com/cheezmil/aek-mcp/internal/handlers"
	"github.com/cheezmil/aek-mcp/internal/services"
	"github.com/golang-jwt/jwt/v5"
)

// mcpAuthHandler wraps the MCP proxy handler with authentication.
// Authentication is always required for the MCP endpoint.
// Otherwise, valid Bearer key, JWT token, or X-Auth-Token is required.
func mcpAuthHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check AEK_MCP_KEY from env or query param
		if mcpKey := os.Getenv("AEK_MCP_KEY"); mcpKey != "" {
			if user := services.Store.GetUserByKey(mcpKey); user != nil {
				next.ServeHTTP(w, r)
				return
			}
		}
		if queryKey := r.URL.Query().Get("key"); queryKey != "" {
			if user := services.Store.GetUserByKey(queryKey); user != nil {
				next.ServeHTTP(w, r)
				return
			}
		}

		// Check Authorization header (Bearer key or JWT)
		if authHeader := r.Header.Get("Authorization"); authHeader != "" {
			cleanToken := strings.TrimPrefix(authHeader, "Bearer ")

			// Check against bearer keys
			for _, bk := range services.Store.GetAllBearerKeys() {
				if !bk.Enabled {
					continue
				}
				if subtle.ConstantTimeCompare([]byte(bk.Key), []byte(cleanToken)) == 1 {
					next.ServeHTTP(w, r)
					return
				}
			}

			// Check JWT token
			token, err := jwt.Parse(cleanToken, func(token *jwt.Token) (interface{}, error) {
				return []byte(config.AppConfig.JWTSecret), nil
			})
			if err == nil && token.Valid {
				next.ServeHTTP(w, r)
				return
			}
		}

		// Check X-Auth-Token header or ?token= query
		xAuthToken := r.Header.Get("X-Auth-Token")
		if xAuthToken == "" {
			xAuthToken = r.URL.Query().Get("token")
		}
		if xAuthToken != "" {
			token, err := jwt.Parse(xAuthToken, func(token *jwt.Token) (interface{}, error) {
				return []byte(config.AppConfig.JWTSecret), nil
			})
			if err == nil && token.Valid {
				next.ServeHTTP(w, r)
				return
			}
		}

		http.Error(w, `{"error":"authentication required"}`, http.StatusUnauthorized)
	})
}

func main() {
	config.Load()
	services.InitStore()
	services.LoadMcpSettings()

	// Connect to all enabled MCP servers
	services.ConnectAllEnabledServers(context.Background())

	// Initialize the MCP proxy server (aggregates all upstream tools)
	handlers.InitMCPProxy()

	ginRouter := handlers.SetupRouter()

	// Wrap gin with net/http mux so /mcp is handled by the Streamable HTTP proxy
	// before gin's routing tree (and its SPA catch-all) gets a chance.
	mux := http.NewServeMux()
	mcpHandler := handlers.GetMCPProxyHandler()
	mux.Handle("/mcp", mcpAuthHandler(mcpHandler))
	mux.Handle("/mcp/", mcpAuthHandler(mcpHandler))
	mux.Handle("/", ginRouter)

	addr := config.AppConfig.Host + ":" + config.AppConfig.Port
	fmt.Printf("Server is running on %s\n", addr)
	fmt.Printf("API available at http://localhost:%s/api\n", config.AppConfig.Port)

	if err := http.ListenAndServe(addr, mux); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to start server: %v\n", err)
		os.Exit(1)
	}
}
