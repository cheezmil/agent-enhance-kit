package handlers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/cheezmil/aek-mcp/internal/config"
	"github.com/cheezmil/aek-mcp/internal/models"
	"github.com/cheezmil/aek-mcp/internal/services"
)

func normalizeServerConfig(server *models.ServerConfig) {
	if server.Type == "" {
		if server.Command != "" {
			server.Type = "stdio"
		} else if server.URL != "" {
			server.Type = "streamable-http"
		}
	}
	if server.Args == nil {
		server.Args = []string{}
	}
	if server.Env == nil {
		server.Env = map[string]string{}
	}
}

func GetAllServers(c *gin.Context) {
	page := 1
	limit := 1000
	if p := c.Query("page"); p != "" {
		fmt.Sscanf(p, "%d", &page)
	}
	if l := c.Query("limit"); l != "" {
		fmt.Sscanf(l, "%d", &limit)
	}
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 1000 {
		limit = 1000
	}

	servers, total := services.Store.GetServersPaginated(page, limit)
	totalPages := (total + limit - 1) / limit

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    servers,
		"pagination": gin.H{
			"page":       page,
			"limit":      limit,
			"total":      total,
			"totalPages": totalPages,
		},
	})
}

func GetServerConfig(c *gin.Context) {
	name := c.Param("serverName")
	server := services.Store.GetServer(name)
	if server == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "Server not found",
		})
		return
	}

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    server,
	})
}

func CreateServer(c *gin.Context) {
	var server models.ServerConfig
	if err := c.ShouldBindJSON(&server); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	if server.Name == "" {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Server name is required",
		})
		return
	}

	// Validate type
	validTypes := map[string]bool{"stdio": true, "sse": true, "streamable-http": true, "openapi": true}
	if server.Type != "" && !validTypes[server.Type] {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid server type. Must be: stdio, sse, streamable-http, or openapi",
		})
		return
	}

	// Validate type-specific requirements
	if server.Type == "sse" || server.Type == "streamable-http" || server.Type == "openapi" {
		if server.URL == "" {
			c.JSON(http.StatusBadRequest, models.ApiResponse{
				Success: false,
				Message: "URL is required for " + server.Type + " servers",
			})
			return
		}
	}
	if server.Type == "stdio" || server.Command != "" {
		if server.Command == "" {
			c.JSON(http.StatusBadRequest, models.ApiResponse{
				Success: false,
				Message: "Command is required for stdio servers",
			})
			return
		}
	}

	normalizeServerConfig(&server)
	server.Enabled = true

	if existing := services.Store.GetServer(server.Name); existing != nil {
		c.JSON(http.StatusConflict, models.ApiResponse{
			Success: false,
			Message: "Server already exists",
		})
		return
	}

	services.Store.CreateServer(&server)
	services.Store.AddLogEntry(&models.LogEntry{
		Type:    "info",
		Source:  "server",
		Message: "Server created: " + server.Name,
	})

	c.JSON(http.StatusCreated, models.ApiResponse{
		Success: true,
		Data:    server,
	})
}

func BatchCreateServers(c *gin.Context) {
	var servers []models.ServerConfig
	if err := c.ShouldBindJSON(&servers); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	results := make([]models.ApiResponse, 0)
	for i := range servers {
		normalizeServerConfig(&servers[i])
		servers[i].Enabled = true
		services.Store.CreateServer(&servers[i])
		results = append(results, models.ApiResponse{
			Success: true,
			Data:    servers[i],
		})
	}

	c.JSON(http.StatusCreated, models.ApiResponse{
		Success: true,
		Data:    results,
	})
}

func UpdateServer(c *gin.Context) {
	name := c.Param("serverName")
	existing := services.Store.GetServer(name)
	if existing == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "Server not found",
		})
		return
	}

	var server models.ServerConfig
	if err := c.ShouldBindJSON(&server); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	server.Name = name
	normalizeServerConfig(&server)
	services.Store.UpdateServer(name, &server)

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    server,
	})
}

func DeleteServer(c *gin.Context) {
	name := c.Param("serverName")
	if services.Store.GetServer(name) == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "Server not found",
		})
		return
	}

	services.Store.DeleteServer(name)
	services.Store.AddLogEntry(&models.LogEntry{
		Type:    "info",
		Source:  "server",
		Message: "Server deleted: " + name,
	})

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Message: "Server deleted successfully",
	})
}

func ToggleServer(c *gin.Context) {
	name := c.Param("serverName")
	server := services.Store.GetServer(name)
	if server == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "Server not found",
		})
		return
	}

	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	server.Enabled = req.Enabled
	services.Store.UpdateServer(name, server)

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    server,
	})
}

func ReloadServer(c *gin.Context) {
	name := c.Param("serverName")
	server := services.Store.GetServer(name)
	if server == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "Server not found",
		})
		return
	}

	services.Store.AddLogEntry(&models.LogEntry{
		Type:    "info",
		Source:  "server",
		Message: "Server reloaded: " + name,
	})

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Message: "Server reloaded",
		Data:    server,
	})
}

func ToggleTool(c *gin.Context) {
	serverName := c.Param("serverName")
	toolName := c.Param("toolName")
	server := services.Store.GetServer(serverName)
	if server == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "Server not found",
		})
		return
	}

	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	for i := range server.Tools {
		if server.Tools[i].Name == toolName {
			server.Tools[i].Enabled = req.Enabled
			break
		}
	}

	services.Store.UpdateServer(serverName, server)

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    server,
	})
}

func UpdateToolDescription(c *gin.Context) {
	serverName := c.Param("serverName")
	toolName := c.Param("toolName")
	server := services.Store.GetServer(serverName)
	if server == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "Server not found",
		})
		return
	}

	var req struct {
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	for i := range server.Tools {
		if server.Tools[i].Name == toolName {
			server.Tools[i].Description = req.Description
			break
		}
	}

	services.Store.UpdateServer(serverName, server)

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    server,
	})
}

func ResetToolDescription(c *gin.Context) {
	serverName := c.Param("serverName")
	toolName := c.Param("toolName")
	server := services.Store.GetServer(serverName)
	if server == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "Server not found",
		})
		return
	}

	for i := range server.Tools {
		if server.Tools[i].Name == toolName {
			server.Tools[i].Description = ""
			break
		}
	}

	services.Store.UpdateServer(serverName, server)

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    server,
	})
}

func TogglePrompt(c *gin.Context) {
	serverName := c.Param("serverName")
	promptName := c.Param("promptName")
	server := services.Store.GetServer(serverName)
	if server == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "Server not found",
		})
		return
	}

	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	for i := range server.Prompts {
		if server.Prompts[i].Name == promptName {
			server.Prompts[i].Enabled = req.Enabled
			break
		}
	}

	services.Store.UpdateServer(serverName, server)

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    server,
	})
}

func UpdatePromptDescription(c *gin.Context) {
	serverName := c.Param("serverName")
	promptName := c.Param("promptName")
	server := services.Store.GetServer(serverName)
	if server == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "Server not found",
		})
		return
	}

	var req struct {
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	for i := range server.Prompts {
		if server.Prompts[i].Name == promptName {
			server.Prompts[i].Description = req.Description
			break
		}
	}

	services.Store.UpdateServer(serverName, server)

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    server,
	})
}

func ResetPromptDescription(c *gin.Context) {
	serverName := c.Param("serverName")
	promptName := c.Param("promptName")
	server := services.Store.GetServer(serverName)
	if server == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "Server not found",
		})
		return
	}

	for i := range server.Prompts {
		if server.Prompts[i].Name == promptName {
			server.Prompts[i].Description = ""
			break
		}
	}

	services.Store.UpdateServer(serverName, server)

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    server,
	})
}

func ToggleResource(c *gin.Context) {
	serverName := c.Param("serverName")
	resourceUri := c.Param("resourceUri")
	server := services.Store.GetServer(serverName)
	if server == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "Server not found",
		})
		return
	}

	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	for i := range server.Resources {
		if server.Resources[i].URI == resourceUri {
			server.Resources[i].Enabled = req.Enabled
			break
		}
	}

	services.Store.UpdateServer(serverName, server)

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    server,
	})
}

func UpdateResourceDescription(c *gin.Context) {
	serverName := c.Param("serverName")
	resourceUri := c.Param("resourceUri")
	server := services.Store.GetServer(serverName)
	if server == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "Server not found",
		})
		return
	}

	var req struct {
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	for i := range server.Resources {
		if server.Resources[i].URI == resourceUri {
			server.Resources[i].Description = req.Description
			break
		}
	}

	services.Store.UpdateServer(serverName, server)

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    server,
	})
}

func ResetResourceDescription(c *gin.Context) {
	serverName := c.Param("serverName")
	resourceUri := c.Param("resourceUri")
	server := services.Store.GetServer(serverName)
	if server == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "Server not found",
		})
		return
	}

	for i := range server.Resources {
		if server.Resources[i].URI == resourceUri {
			server.Resources[i].Description = ""
			break
		}
	}

	services.Store.UpdateServer(serverName, server)

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    server,
	})
}

func GetAllSettings(c *gin.Context) {
	servers := services.Store.GetAllServers()
	groups := services.Store.GetAllGroups()
	users := services.Store.GetAllUsers()
	bearerKeys := services.Store.GetAllBearerKeys()
	sysConfig := services.Store.GetSystemConfig()

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data: map[string]interface{}{
			"servers":      servers,
			"groups":       groups,
			"users":        users,
			"systemConfig": sysConfig,
			"bearerKeys":   bearerKeys,
		},
	})
}

func UpdateSystemConfig(c *gin.Context) {
	var config map[string]interface{}
	if err := c.ShouldBindJSON(&config); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	sysConfig := services.Store.GetSystemConfig()
	if sysConfig == nil {
		sysConfig = &models.SystemConfig{}
	}

	// Merge fields
	for key, value := range config {
		if sysConfig.Routing == nil {
			sysConfig.Routing = make(map[string]interface{})
		}
		sysConfig.Routing[key] = value
	}

	services.Store.UpdateSystemConfig(sysConfig)

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data: map[string]interface{}{
			"systemConfig": sysConfig,
		},
	})
}

func GetServerCosts(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    map[string]interface{}{},
	})
}

func GetGroupCosts(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    map[string]interface{}{},
	})
}

func CallTool(c *gin.Context) {
	serverName := c.Param("server")
	server := services.Store.GetServer(serverName)
	if server == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "Server not found",
		})
		return
	}

	var req models.ToolCallRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	services.Store.AddLogEntry(&models.LogEntry{
		Type:    "info",
		Source:  "tool",
		Message: "Tool call: " + serverName + "/" + req.ToolName,
	})

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data: map[string]interface{}{
			"content": []map[string]string{
				{"type": "text", "text": "Tool call placeholder - MCP server not connected"},
			},
		},
	})
}

func GetPrompt(c *gin.Context) {
	serverName := c.Param("serverName")
	promptName := c.Param("promptName")

	services.Store.AddLogEntry(&models.LogEntry{
		Type:    "info",
		Source:  "prompt",
		Message: "Prompt request: " + serverName + "/" + promptName,
	})

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data: map[string]interface{}{
			"description": "Prompt placeholder",
			"messages":    []interface{}{},
		},
	})
}

func GetRuntimeConfig(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data: models.RuntimeConfig{
			BasePath: config.AppConfig.BasePath,
			Version:  "dev",
			Name:     "mcphub",
		},
	})
}

func GetPublicConfig(c *gin.Context) {
	sysConfig := services.Store.GetSystemConfig()
	skipAuth := false
	if sysConfig != nil && sysConfig.Routing != nil {
		if v, ok := sysConfig.Routing["skipAuth"].(bool); ok {
			skipAuth = v
		}
	}

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data: map[string]interface{}{
			"skipAuth": skipAuth,
		},
	})
}

func HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "healthy",
		"time":   time.Now().Format(time.RFC3339),
	})
}

// Template handlers
func ExportConfigTemplate(c *gin.Context) {
	servers := services.Store.GetAllServers()
	groups := services.Store.GetAllGroups()

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data: map[string]interface{}{
			"name":    "export",
			"servers": servers,
			"groups":  groups,
		},
	})
}

func ExportGroupAsTemplate(c *gin.Context) {
	groupId := c.Param("groupId")
	group := services.Store.GetGroup(groupId)
	if group == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "Group not found",
		})
		return
	}

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    group,
	})
}

func ImportConfigTemplate(c *gin.Context) {
	var req struct {
		Servers []models.ServerConfig `json:"servers"`
		Groups  []models.Group        `json:"groups"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	for i := range req.Servers {
		services.Store.CreateServer(&req.Servers[i])
	}
	for i := range req.Groups {
		if req.Groups[i].ID == "" {
			req.Groups[i].ID = uuid.New().String()
		}
		services.Store.CreateGroup(&req.Groups[i])
	}

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Message: "Template imported successfully",
	})
}
