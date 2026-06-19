package handlers

import (
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"time"
	"github.com/gin-gonic/gin"
	"github.com/cheezmil/aek-mcp/internal/config"
	"github.com/cheezmil/aek-mcp/internal/middleware"
)

func SetupRouter() *gin.Engine {
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
		c.Header("Access-Control-Allow-Credentials", "true")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	})

	r.GET("/health", HealthCheck)
	r.GET("/config", GetRuntimeConfig)
	r.GET("/public-config", GetPublicConfig)

	r.POST("/auth/login", Login)
	r.POST("/auth/register", Register)
	r.POST("/auth/auto-login", AutoLogin)
	r.GET("/auth/user", middleware.AuthMiddleware(), GetAuthUser)
	r.POST("/auth/change-password", middleware.AuthMiddleware(), ChangePassword)

	// Auth routes under /api prefix (frontend getApiUrl adds /api, no auth required)
	// Auth routes under /api prefix (frontend getApiUrl adds /api)
	authApi := r.Group("/api")
	authApi.POST("/auth/login", Login)
	authApi.POST("/auth/register", Register)
	authApi.POST("/auth/auto-login", AutoLogin)
	authApi.GET("/auth/user", middleware.AuthMiddleware(), GetAuthUser)
	authApi.POST("/auth/change-password", middleware.AuthMiddleware(), ChangePassword)

	api := r.Group("/api")
	{
		api.Use(middleware.AuthMiddleware())

		// Server management - 使用 serverName 参数避免冲突
		api.GET("/servers", GetAllServers)
		api.GET("/servers/:serverName", GetServerConfig)
		api.POST("/servers", CreateServer)
		api.POST("/servers/batch", BatchCreateServers)
		api.PUT("/servers/:serverName", UpdateServer)
		api.DELETE("/servers/:serverName", DeleteServer)
		api.POST("/servers/:serverName/toggle", ToggleServer)
		api.POST("/servers/:serverName/reload", ReloadServer)

		// Tool management
		api.POST("/servers/:serverName/tools/:toolName/toggle", ToggleTool)
		api.PUT("/servers/:serverName/tools/:toolName/description", UpdateToolDescription)
		api.DELETE("/servers/:serverName/tools/:toolName/description", ResetToolDescription)

		// Prompt management
		api.POST("/servers/:serverName/prompts/:promptName/toggle", TogglePrompt)
		api.PUT("/servers/:serverName/prompts/:promptName/description", UpdatePromptDescription)
		api.DELETE("/servers/:serverName/prompts/:promptName/description", ResetPromptDescription)

		// Resource management
		api.POST("/servers/:serverName/resources/:resourceUri/toggle", ToggleResource)
		api.PUT("/servers/:serverName/resources/:resourceUri/description", UpdateResourceDescription)
		api.DELETE("/servers/:serverName/resources/:resourceUri/description", ResetResourceDescription)

		// Settings
		api.PUT("/system-config", UpdateSystemConfig)
		api.GET("/settings", GetAllSettings)
		api.GET("/cost/servers", GetServerCosts)
		api.GET("/cost/groups", GetGroupCosts)

		// Groups
		api.GET("/groups", GetGroups)
		api.GET("/groups/:groupId", GetGroup)
		api.POST("/groups", CreateGroup)
		api.POST("/groups/batch", BatchCreateGroups)
		api.PUT("/groups/:groupId", UpdateGroup)
		api.DELETE("/groups/:groupId", DeleteGroup)
		api.POST("/groups/:groupId/servers", AddServerToGroup)
		api.DELETE("/groups/:groupId/servers/:serverName", RemoveServerFromGroup)
		api.GET("/groups/:groupId/servers", GetGroupServers)
		api.PUT("/groups/:groupId/servers/batch", UpdateGroupServersBatch)
		api.GET("/groups/:groupId/server-configs", GetGroupServerConfigs)
		api.GET("/groups/:groupId/server-configs/:serverName", GetGroupServerConfig)
		api.PUT("/groups/:groupId/server-configs/:serverName/tools", UpdateGroupServerTools)

		// Users
		api.GET("/users", GetUsers)
		api.GET("/users/:username", GetUser)
		api.POST("/users", CreateUser)
		api.PUT("/users/:username", UpdateUser)
		api.DELETE("/users/:username", DeleteUser)
		api.GET("/users-stats", GetUserStats)

		// Activities
		api.GET("/activities/available", CheckActivityAvailable)
		api.GET("/activities", GetActivities)
		api.GET("/activities/stats", GetActivityStats)
		api.GET("/activities/filters", GetActivityFilterOptions)
		api.GET("/activities/:activityId", GetActivityByID)
		api.DELETE("/activities/cleanup", DeleteOldActivities)

		// Templates
		api.POST("/templates/export", ExportConfigTemplate)
		api.GET("/templates/export/groups/:groupId", ExportGroupAsTemplate)
		api.POST("/templates/import", ImportConfigTemplate)

		// MCP tools and prompts
		api.POST("/tools/call/:server", CallTool)
		api.GET("/tools/list/:serverName", ListServerTools)
		api.POST("/mcp/:serverName/prompts/:promptName", GetPrompt)
		api.POST("/prompts/call/:server", CallPrompt)
		api.POST("/prompts/call", CallPrompt)

		// Built-in prompts
		api.GET("/prompts", ListBuiltinPrompts)
		api.GET("/prompts/:promptId", GetBuiltinPrompt)
		api.POST("/prompts", CreateBuiltinPrompt)
		api.PUT("/prompts/:promptId", UpdateBuiltinPrompt)
		api.DELETE("/prompts/:promptId", DeleteBuiltinPrompt)

		// Built-in resources
		api.GET("/resources", ListBuiltinResources)
		api.GET("/resources/:resourceId", GetBuiltinResource)
		api.POST("/resources", CreateBuiltinResource)
		api.PUT("/resources/:resourceId", UpdateBuiltinResource)
		api.DELETE("/resources/:resourceId", DeleteBuiltinResource)
		api.POST("/resources/read", ReadResource)

		// MCPB upload
		api.POST("/mcpb/upload", UploadMcpbFile)

		// Changelog
		api.GET("/changelog/update-info", GetChangelogUpdateInfo)

		// Logs
		api.GET("/logs", GetLogs)
		api.DELETE("/logs", ClearLogs)
		api.GET("/logs/stream", StreamLogs)

		// MCP settings
		api.GET("/mcp-settings/export", GetMcpSettingsJson)
		api.GET("/better-auth/user", GetBetterAuthUser)

		// Bearer keys
		api.GET("/auth/keys", GetBearerKeys)
		api.POST("/auth/keys", CreateBearerKey)
		api.PUT("/auth/keys/:keyId", UpdateBearerKey)
		api.DELETE("/auth/keys/:keyId", DeleteBearerKey)

		// OAuth clients
		api.GET("/oauth/clients", GetAllClients)
		api.GET("/oauth/clients/:clientId", GetClient)
		api.POST("/oauth/clients", CreateClient)
		api.PUT("/oauth/clients/:clientId", UpdateClient)
		api.DELETE("/oauth/clients/:clientId", DeleteClient)
		api.POST("/oauth/clients/:clientId/regenerate-secret", RegenerateSecret)
	}

	// OAuth endpoints (no auth required)
	r.GET("/oauth/authorize", GetAuthorize)
	r.POST("/oauth/authorize", PostAuthorize)
	r.POST("/oauth/token", PostToken)
	r.GET("/oauth/userinfo", GetUserInfo)
	r.GET("/.well-known/oauth-authorization-server", GetMetadata)
	r.GET("/.well-known/oauth-protected-resource", GetProtectedResourceMetadata)
	r.POST("/oauth/register", RegisterClient)
	r.GET("/oauth/register/:clientId", GetClientConfiguration)
	r.PUT("/oauth/register/:clientId", UpdateClientConfiguration)
	r.DELETE("/oauth/register/:clientId", DeleteClientRegistration)

	// Internal endpoints
	r.POST("/internal/v1/events", ReceiveHostedInternalEvent)
	r.GET("/internal/v1/hosted/runtime-catalog", GetHostedInternalRuntimeCatalog)
	r.GET("/oauth/callback", HandleOAuthCallback)

	// Marketplace discovery
	r.GET("/.well-known/mcp-marketplace", GetMarketplaceWellKnown)

	// OpenAPI endpoints
	r.GET("/api/openapi.json", GetOpenAPISpec)
	r.GET("/api/:groupName/openapi.json", GetGroupOpenAPISpec)
	r.GET("/api/openapi/servers", GetOpenAPIServers)
	r.GET("/api/openapi/stats", GetOpenAPIStats)
	r.GET("/api/tools/:serverName/:toolName", ExecuteToolViaOpenAPI)
	r.POST("/api/tools/:serverName/:toolName", ExecuteToolViaOpenAPI)
	r.GET("/api/:groupName/tools/:serverName/:toolName", ExecuteToolViaOpenAPI)
	r.POST("/api/:groupName/tools/:serverName/:toolName", ExecuteToolViaOpenAPI)

	// Discovery endpoints
	r.GET("/discovery/servers", ListDiscoveryServers)
	r.GET("/discovery/servers/:serverName", GetDiscoveryServer)
	r.GET("/discovery/servers/:serverName/install", GetDiscoveryServerInstall)
	r.GET("/discovery/categories", ListDiscoveryCategories)
	r.GET("/discovery/tags", ListDiscoveryTags)

	// Serve frontend static files or reverse proxy in dev mode
	if config.AppConfig.DevProxy != "" {
		// Dev mode: reverse proxy all non-API requests to Next.js dev server
		proxyTarget, _ := url.Parse(config.AppConfig.DevProxy)
		proxy := &httputil.ReverseProxy{
			Director: func(req *http.Request) {
				req.URL.Scheme = proxyTarget.Scheme
				req.URL.Host = proxyTarget.Host
				req.Host = proxyTarget.Host
			},
			Transport: &http.Transport{
				DialContext: (&net.Dialer{
					Timeout:   10 * time.Second,
					KeepAlive: 30 * time.Second,
				}).DialContext,
				ResponseHeaderTimeout: 30 * time.Second,
			},
		}
		// WebSocket upgrade detection
		r.NoRoute(func(c *gin.Context) {
			if isWebSocketUpgrade(c.Request) {
				proxyWebSocket(c, config.AppConfig.DevProxy)
				return
			}
			proxy.ServeHTTP(c.Writer, c.Request)
		})
	} else if !config.AppConfig.DisableWeb {
		r.Static("/assets", "./frontend/dist/assets")
		r.Static("/_next/static", "./frontend/dist/_next/static")
		r.NoRoute(func(c *gin.Context) {
			path := c.Request.URL.Path

			// Next.js static export generates .txt files with RSC payload per route
			// e.g. /groups.txt contains the RSC payload for /groups
			if strings.HasSuffix(path, ".txt") {
				rscFile := "./frontend/dist" + path
				if _, err := os.Stat(rscFile); err == nil {
					c.Header("Content-Type", "text/x-component; charset=utf-8")
					c.File(rscFile)
					return
				}
			}

			// Determine which HTML file to serve
			htmlFile := "./frontend/dist/index.html"
			if path != "/" {
				candidate := "./frontend/dist" + path + ".html"
				if _, err := os.Stat(candidate); err == nil {
					htmlFile = candidate
				}
			}

			// Next.js RSC navigation: extract payload from HTML and return as RSC stream
			if c.GetHeader("RSC") == "1" || c.GetHeader("Next-Router-State-Tree") != "" {
				data, err := os.ReadFile(htmlFile)
				if err != nil {
					c.Status(500)
					return
				}
				html := string(data)

				// Extract RSC payloads: all <script>self.__next_f.push(...)</script> tags
				var rscPayload string
				for {
					idx := strings.Index(html, "self.__next_f.push(")
					if idx == -1 {
						break
					}
					// Find the enclosing <script> tag
					scriptStart := strings.LastIndex(html[:idx], "<script>")
					scriptEnd := strings.Index(html[idx:], "</script>")
					if scriptStart == -1 || scriptEnd == -1 {
						break
					}
					scriptContent := html[scriptStart : idx+scriptEnd+len("</script>")]
					// Extract just the push call content
					pushStart := strings.Index(scriptContent, "self.__next_f.push(")
					pushEnd := strings.LastIndex(scriptContent, ")")
					if pushStart != -1 && pushEnd != -1 {
						// Get the argument inside push(...)
						argStart := pushStart + len("self.__next_f.push(")
						rscPayload += scriptContent[argStart:pushEnd] + "\n"
					}
					html = html[idx+scriptEnd+len("</script>"):]
				}

				if rscPayload != "" {
					c.Header("Content-Type", "text/x-component")
					c.Header("RSC", "1")
					c.Header("Next-Router-State-Tree", c.GetHeader("Next-Router-State-Tree"))
					c.String(200, rscPayload)
					return
				}
			}

			// Full HTML page load
			c.File(htmlFile)
		})
	}

	return r
}

// isWebSocketUpgrade checks if the request is a WebSocket upgrade request.
func isWebSocketUpgrade(r *http.Request) bool {
	for _, v := range r.Header["Upgrade"] {
		if strings.ToLower(v) == "websocket" {
			return true
		}
	}
	return false
}

// proxyWebSocket proxies a WebSocket connection to the target server.
func proxyWebSocket(c *gin.Context, target string) {
	targetURL, err := url.Parse(target)
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}

	// Connect to the backend
	backendAddr := targetURL.Host
	if !strings.Contains(backendAddr, ":") {
		backendAddr += ":80"
	}
	backendConn, err := net.Dial("tcp", backendAddr)
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}

	// Hijack the client connection
	clientConn, _, err := c.Writer.Hijack()
	if err != nil {
		backendConn.Close()
		c.Status(http.StatusInternalServerError)
		return
	}

	// Forward the original HTTP request to the backend
	err = c.Request.Write(backendConn)
	if err != nil {
		clientConn.Close()
		backendConn.Close()
		return
	}

	// Bidirectional copy
	done := make(chan struct{}, 2)
	go func() {
		io.Copy(backendConn, clientConn)
		done <- struct{}{}
	}()
	go func() {
		io.Copy(clientConn, backendConn)
		done <- struct{}{}
	}()

	<-done
	clientConn.Close()
	backendConn.Close()
}
