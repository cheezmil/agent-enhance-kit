package handlers

import (
	"context"
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
	return buildGinRouter()
}

func buildGinRouter() *gin.Engine {
	r := gin.Default()

	// CORS middleware
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

	// gin serves the API backend only (no static files, no reverse proxy).
	// The frontend (Next.js) runs on a separate port and proxies /aek-mcp/api/*
	// requests here via rewrites in next.config.ts.
	serveAPIRoutes(r)

	return r
}

func serveAPIRoutes(r *gin.Engine) {
	r.GET("/health", HealthCheck)
	r.GET("/config", GetRuntimeConfig)
	r.GET("/public-config", GetPublicConfig)

	r.POST("/auth/login", Login)
	r.POST("/auth/register", Register)
	r.POST("/auth/auto-login", AutoLogin)
	r.GET("/auth/user", middleware.AuthMiddleware(), GetAuthUser)
	r.POST("/auth/change-password", middleware.AuthMiddleware(), ChangePassword)

	// Auth routes under /api prefix (frontend getApiUrl adds /api, no auth required)
	authApi := r.Group("/api")
	authApi.POST("/auth/login", Login)
	authApi.POST("/auth/register", Register)
	authApi.POST("/auth/auto-login", AutoLogin)
	authApi.GET("/auth/user", middleware.AuthMiddleware(), GetAuthUser)
	authApi.POST("/auth/change-password", middleware.AuthMiddleware(), ChangePassword)

	api := r.Group("/api")
	{
		api.Use(middleware.AuthMiddleware())

		// Server management
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
		api.GET("/mcp-settings/raw", GetMcpSettingsRaw)
		api.PUT("/mcp-settings/raw", SaveMcpSettingsRaw)
		api.GET("/better-auth/user", GetBetterAuthUser)

		// Tutorial config
		api.GET("/tutorial/config", GetTutorialConfig)
		api.GET("/tutorial/prefs", GetTutorialPrefs)
		api.PUT("/tutorial/prefs", SaveTutorialPrefs)
		api.GET("/tutorial/agents", ListTutorialAgents)
		api.POST("/tutorial/apply", ApplyTutorialConfig)
		api.POST("/tutorial/remove", RemoveTutorialConfig)

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
}

func serveFrontend(r *gin.Engine) {
	frontendDir := "./frontend/dist"

	if config.AppConfig.DevProxy != "" {
		// Dev mode: proxy all non-API requests to the Next.js server.
		// gin's middleware has already stripped the base path (e.g. /aek-mcp),
		// so the incoming path is the short form (/tutorial, /_next/static/... etc.).
		// Next.js has basePath: '/aek-mcp', so we re-attach it before forwarding.
		basePath := config.AppConfig.BasePath
		proxyTarget, _ := url.Parse(config.AppConfig.DevProxy)
		proxy := &httputil.ReverseProxy{
			Director: func(req *http.Request) {
				req.URL.Scheme = proxyTarget.Scheme
				req.URL.Host = proxyTarget.Host
				req.Host = proxyTarget.Host
				if basePath != "" {
					req.URL.Path = basePath + req.URL.Path
				}
			},
			Transport: &http.Transport{
				DialContext: (&net.Dialer{
					Timeout:   10 * time.Second,
					KeepAlive: 30 * time.Second,
				}).DialContext,
				ResponseHeaderTimeout: 30 * time.Second,
			},
		}
		r.NoRoute(func(c *gin.Context) {
			if isWebSocketUpgrade(c.Request) {
				proxyWebSocket(c, config.AppConfig.DevProxy)
				return
			}
			proxy.ServeHTTP(c.Writer, c.Request)
		})
		return
	}

	if config.AppConfig.DisableWeb {
		return
	}

	// Production: serve the static export from frontend/dist.
	// Mount at the base path ("/" after stripping) so gin.Static resolves
	// relative to the configured dist directory.
	r.Static("/assets", filepathJoin(frontendDir, "assets"))
	r.Static("/_next/static", filepathJoin(frontendDir, "_next/static"))

	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		// Treat a bare "/" as "/index.html" for SPA fallback
		if path == "/" {
			serveHTML(filepathJoin(frontendDir, "index.html"), c)
			return
		}

		// Next.js static export emits an .html file per route.
		// Try <path>.html first, then fall back to index.html for client-side routing.
		candidateHTML := filepathJoin(frontendDir, path+".html")
		if _, err := os.Stat(candidateHTML); err == nil {
			serveHTML(candidateHTML, c)
			return
		}

		// SPA fallback
		serveHTML(filepathJoin(frontendDir, "index.html"), c)
	})
}

func serveHTML(path string, c *gin.Context) {
	c.File(path)
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

// proxyWebSocket proxies a WebSocket connection to the target dev server.
func proxyWebSocket(c *gin.Context, target string) {
	targetURL, err := url.Parse(target)
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}
	backendAddr := targetURL.Host
	if !strings.Contains(backendAddr, ":") {
		backendAddr += ":80"
	}
	backendConn, err := net.Dial("tcp", backendAddr)
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}
	clientConn, _, err := c.Writer.Hijack()
	if err != nil {
		backendConn.Close()
		c.Status(http.StatusInternalServerError)
		return
	}
	if err := c.Request.Write(backendConn); err != nil {
		clientConn.Close()
		backendConn.Close()
		return
	}
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

// Strip the runtime RSC payload from index.html and return it.
// Used when the frontend is served via RSC headers (RSC=1).
func extractRSCPayload(html string) string {
	var payload string
	for {
		idx := strings.Index(html, "self.__next_f.push(")
		if idx == -1 {
			break
		}
		scriptEnd := strings.Index(html[idx:], "</script>")
		if scriptEnd == -1 {
			break
		}
		insideScript := html[idx : idx+scriptEnd]
		pushEnd := strings.LastIndex(insideScript, ")")
		if pushEnd == -1 {
			break
		}
		argStart := idx + len("self.__next_f.push(")
		payload += html[argStart:idx+pushEnd] + "\n"
		html = html[idx+scriptEnd+len("</script>"):]
	}
	return payload
}

// Ensure a context is ready even if gin is nil (for headless / non-web use).
func init() {
	_ = context.Background()
}

func filepathJoin(elem ...string) string {
	return strings.Join(elem, "/")
}
