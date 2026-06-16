package handlers

import (
	"net/http"

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
	r.GET("/auth/user", middleware.AuthMiddleware(), GetAuthUser)
	r.POST("/auth/change-password", middleware.AuthMiddleware(), ChangePassword)

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
		api.POST("/mcp/:serverName/prompts/:promptName", GetPrompt)

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

		// Market
		api.GET("/market/servers", GetAllMarketServers)
		api.GET("/market/servers/search", SearchMarketServers)
		api.GET("/market/servers/:serverName", GetMarketServer)
		api.GET("/market/categories", GetAllMarketCategories)
		api.GET("/market/categories/:category", GetMarketServersByCategory)
		api.GET("/market/tags", GetAllMarketTags)
		api.GET("/market/tags/:tag", GetMarketServersByTag)

		// Cloud
		api.GET("/cloud/servers", GetAllCloudServers)
		api.GET("/cloud/servers/search", SearchCloudServers)
		api.GET("/cloud/servers/:serverName", GetCloudServer)
		api.GET("/cloud/categories", GetAllCloudCategories)
		api.GET("/cloud/categories/:category", GetCloudServersByCategory)
		api.GET("/cloud/tags", GetAllCloudTags)
		api.GET("/cloud/tags/:tag", GetCloudServersByTag)
		api.GET("/cloud/servers/:serverName/tools", GetCloudServerTools)
		api.POST("/cloud/servers/:serverName/tools/:toolName/call", CallCloudTool)

		// Registry
		api.GET("/registry/servers", GetAllRegistryServers)
		api.GET("/registry/servers/versions", GetRegistryServerVersions)
		api.GET("/registry/servers/version", GetRegistryServerVersion)

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

	// Serve frontend static files
	if !config.AppConfig.DisableWeb {
		r.Static("/assets", "./frontend/dist/assets")
		r.StaticFile("/", "./frontend/dist/index.html")
		r.NoRoute(func(c *gin.Context) {
			c.File("./frontend/dist/index.html")
		})
	}

	return r
}
