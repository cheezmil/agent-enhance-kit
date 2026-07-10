package handlers

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/pkoukk/tiktoken-go"
	"github.com/cheezmil/aek-mcp/internal/config"
	"github.com/cheezmil/aek-mcp/internal/models"
	"github.com/cheezmil/aek-mcp/internal/services"
	"github.com/mark3labs/mcp-go/mcp"
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

	// Connect or disconnect MCP client
	if req.Enabled {
		go func() {
			if err := services.ConnectServerByName(c.Request.Context(), name); err != nil {
				services.Store.AddLogEntry(&models.LogEntry{
					Type:    "error",
					Source:  "server",
					Message: "Failed to connect " + name + ": " + err.Error(),
				})
			}
		}()
	} else {
		services.GlobalMCPClients.Disconnect(name)
	}

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

	// Disconnect existing connection first
	services.GlobalMCPClients.Disconnect(name)
	server.Status = "disconnected"
	services.Store.UpdateServer(name, server)

	// Return immediately, reconnect in background
	go func() {
		err := services.ConnectServerByName(context.Background(), name)
		if err != nil {
			services.Store.AddLogEntry(&models.LogEntry{
				Type:    "error",
				Source:  "server",
				Message: "Failed to reload server " + name + ": " + err.Error(),
			})
		} else {
			services.Store.AddLogEntry(&models.LogEntry{
				Type:    "info",
				Source:  "server",
				Message: "Server reloaded: " + name,
			})
		}
		services.RefreshProxyToolsIfAvailable()
	}()

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Message: "Server reload started",
		Data:    server,
	})
}

func ListServerTools(c *gin.Context) {
	serverName := c.Param("serverName")
	server := services.Store.GetServer(serverName)
	if server == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "Server not found",
		})
		return
	}

	// Ensure connected
	_, connected := services.GlobalMCPClients.Get(serverName)
	if !connected && server.URL != "" {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		if err := services.ConnectServerByName(ctx, serverName); err != nil {
			c.JSON(http.StatusServiceUnavailable, models.ApiResponse{
				Success: false,
				Message: "Failed to connect: " + err.Error(),
			})
			return
		}
	}

	tools, err := services.GlobalMCPClients.ListTools(c.Request.Context(), serverName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ApiResponse{
			Success: false,
			Message: err.Error(),
		})
		return
	}

	// Convert and update server's tool config
	toolConfigs := make([]models.ToolConfig, 0, len(tools))
	toolMap := make(map[string]bool)
	for _, t := range tools {
		toolConfigs = append(toolConfigs, models.ToolConfig{
			Name:        t.Name,
			Description: t.Description,
			Enabled:     true,
		})
		toolMap[t.Name] = true
	}

	// Keep enabled/disabled state from existing config
	for i := range toolConfigs {
		for _, existing := range server.Tools {
			if existing.Name == toolConfigs[i].Name {
				toolConfigs[i].Enabled = existing.Enabled
				break
			}
		}
	}
	server.Tools = toolConfigs
	services.Store.UpdateServer(serverName, server)

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    tools,
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

	// Merge settings.jsonc values into systemConfig
	settingsJson := config.ReadSettingsJson()
	if sysConfig == nil {
		sysConfig = &models.SystemConfig{}
	}
	if sysConfig.Routing == nil {
		sysConfig.Routing = make(map[string]interface{})
	}
	for _, k := range []string{"enableBearerAuth"} {
		if v, ok := settingsJson[k]; ok {
			sysConfig.Routing[k] = v
		}
	}

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
	var reqBody map[string]interface{}
	if err := c.ShouldBindJSON(&reqBody); err != nil {
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
	for key, value := range reqBody {
		if sysConfig.Routing == nil {
			sysConfig.Routing = make(map[string]interface{})
		}
		sysConfig.Routing[key] = value
	}

	services.Store.UpdateSystemConfig(sysConfig)

	// Sync to settings.jsonc for key fields
	settingsUpdates := map[string]interface{}{}
	for k, v := range reqBody {
		if k == "enableBearerAuth" {
			settingsUpdates[k] = v
		}
	}
	if len(settingsUpdates) > 0 {
		if err := config.WriteSettingsJson(settingsUpdates); err != nil {
			fmt.Printf("[aek-mcp] Failed to sync settings.jsonc: %v\n", err)
		}
	}

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data: map[string]interface{}{
			"systemConfig": sysConfig,
		},
	})
}

// tiktokenEncoder is a lazily-initialized cl100k_base encoder
var tiktokenEncoder *tiktoken.Tiktoken

func getEncoder() *tiktoken.Tiktoken {
	if tiktokenEncoder == nil {
		tke, err := tiktoken.GetEncoding("cl100k_base")
		if err != nil {
			return nil
		}
		tiktokenEncoder = tke
	}
	return tiktokenEncoder
}

// countTokens uses cl100k_base encoding (GPT-4/Claude) for accurate token count
func countTokens(text string) int {
	if text == "" {
		return 0
	}
	if enc := getEncoder(); enc != nil {
		return len(enc.Encode(text, nil, nil))
	}
	// Fallback: ~4 chars per token
	n := len(text) / 4
	if n < 1 {
		n = 1
	}
	return n
}

func GetServerCosts(c *gin.Context) {
	servers := services.Store.GetAllServers()
	result := make([]map[string]interface{}, 0, len(servers))

	for _, s := range servers {
		connected := false
		if _, ok := services.GlobalMCPClients.Get(s.Name); ok {
			connected = true
		}

		items := make([]map[string]interface{}, 0)
		exposed := 0
		gross := 0

		// Calculate tool tokens: name + description + JSON schema structure overhead
		for _, tool := range s.Tools {
			// Tool JSON structure includes: {"name":"...","description":"...","inputSchema":{"type":"object","properties":{...},"required":[...]}}
			// Approximate overhead for schema structure: ~150 tokens
			schemaTokens := countTokens(tool.Description) + 150
			tokens := countTokens(tool.Name) + schemaTokens
			gross += tokens
			if tool.Enabled {
				exposed += tokens
			}
			items = append(items, map[string]interface{}{
				"kind":    "tool",
				"name":    tool.Name,
				"tokens":  tokens,
				"enabled": tool.Enabled,
			})
		}

		// Calculate prompt tokens: name + description + JSON structure overhead (~80)
		for _, prompt := range s.Prompts {
			tokens := countTokens(prompt.Name) + countTokens(prompt.Description) + 80
			gross += tokens
			if prompt.Enabled {
				exposed += tokens
			}
			items = append(items, map[string]interface{}{
				"kind":    "prompt",
				"name":    prompt.Name,
				"tokens":  tokens,
				"enabled": prompt.Enabled,
			})
		}

		// Calculate resource tokens: uri + name + description + JSON structure overhead (~60)
		for _, resource := range s.Resources {
			tokens := countTokens(resource.URI) + countTokens(resource.Name) + countTokens(resource.Description) + 60
			gross += tokens
			if resource.Enabled {
				exposed += tokens
			}
			items = append(items, map[string]interface{}{
				"kind":    "resource",
				"name":    resource.Name,
				"tokens":  tokens,
				"enabled": resource.Enabled,
			})
		}

		result = append(result, map[string]interface{}{
			"name":      s.Name,
			"connected": connected,
			"exposed":   exposed,
			"gross":     gross,
			"items":     items,
		})
	}

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    result,
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

	start := time.Now()

	// Check if MCP client is connected
	_, connected := services.GlobalMCPClients.Get(serverName)
	if !connected {
		// Try to connect on-the-fly
		if server.URL != "" {
			ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
			defer cancel()
			if err := services.ConnectServerByName(ctx, serverName); err != nil {
	services.Store.AddLogEntry(&models.LogEntry{
		Type:    "error",
		Source:  "tool",
		Message: "Failed to connect to " + serverName + ": " + err.Error(),
	})
				c.JSON(http.StatusServiceUnavailable, models.ApiResponse{
					Success: false,
					Message: "MCP server not connected: " + err.Error(),
				})
				return
			}
		} else {
			c.JSON(http.StatusServiceUnavailable, models.ApiResponse{
				Success: false,
				Message: "MCP server not connected and no URL configured",
			})
			return
		}
	}

	result, err := services.GlobalMCPClients.CallTool(c.Request.Context(), serverName, req.ToolName, req.Arguments)
	duration := time.Since(start).Milliseconds()

	if err != nil {
	services.Store.AddLogEntry(&models.LogEntry{
		Type:    "error",
		Source:  "tool",
		Message: "Tool call failed: " + serverName + "/" + req.ToolName + ": " + err.Error(),
	})
		services.Store.AddActivity(&models.Activity{
			ID:       uuid.New().String(),
			Server:   serverName,
			Tool:     req.ToolName,
			Status:   "error",
			Error:    err.Error(),
			Duration: duration,
		})
		c.JSON(http.StatusInternalServerError, models.ApiResponse{
			Success: false,
			Message: err.Error(),
		})
		return
	}

	// Convert mcp.Content to JSON-friendly format
	contentArr := make([]map[string]interface{}, 0, len(result.Content))
	for _, item := range result.Content {
		switch v := item.(type) {
		case mcp.TextContent:
			contentArr = append(contentArr, map[string]interface{}{
				"type": "text",
				"text": v.Text,
			})
		case mcp.ImageContent:
			contentArr = append(contentArr, map[string]interface{}{
				"type":     "image",
				"data":     v.Data,
				"mimeType": v.MIMEType,
			})
		case mcp.AudioContent:
			contentArr = append(contentArr, map[string]interface{}{
				"type":     "audio",
				"data":     v.Data,
				"mimeType": v.MIMEType,
			})
		default:
			contentArr = append(contentArr, map[string]interface{}{
				"type": "text",
				"text": fmt.Sprintf("%v", item),
			})
		}
	}

	services.Store.AddLogEntry(&models.LogEntry{
		Type:    "info",
		Source:  "tool",
		Message: "Tool call: " + serverName + "/" + req.ToolName,
	})
	services.Store.AddActivity(&models.Activity{
		ID:       uuid.New().String(),
		Server:   serverName,
		Tool:     req.ToolName,
		Status:   "success",
		Duration: duration,
	})

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"content": contentArr,
	})
}

func GetPrompt(c *gin.Context) {
	serverName := c.Param("serverName")
	promptName := c.Param("promptName")

	_, connected := services.GlobalMCPClients.Get(serverName)
	if !connected {
		if server := services.Store.GetServer(serverName); server != nil && server.URL != "" {
			ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
			defer cancel()
			if err := services.ConnectServerByName(ctx, serverName); err != nil {
				c.JSON(http.StatusServiceUnavailable, models.ApiResponse{
					Success: false,
					Message: "MCP server not connected: " + err.Error(),
				})
				return
			}
		} else {
			c.JSON(http.StatusServiceUnavailable, models.ApiResponse{
				Success: false,
				Message: "MCP server not connected",
			})
			return
		}
	}

	var args map[string]string
	c.ShouldBindJSON(&args)

	result, err := services.GlobalMCPClients.GetPrompt(c.Request.Context(), serverName, promptName, args)
	if err != nil {
		services.Store.AddLogEntry(&models.LogEntry{
			Type:    "error",
			Source:  "prompt",
			Message: "Get prompt failed: " + serverName + "/" + promptName + ": " + err.Error(),
		})
		c.JSON(http.StatusInternalServerError, models.ApiResponse{
			Success: false,
			Message: err.Error(),
		})
		return
	}

	services.Store.AddLogEntry(&models.LogEntry{
		Type:    "info",
		Source:  "prompt",
		Message: "Get prompt: " + serverName + "/" + promptName,
	})

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    result,
	})
}

func CallPrompt(c *gin.Context) {
	serverName := c.Param("server")
	if serverName == "" {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "server parameter is required",
		})
		return
	}

	var req struct {
		PromptName string            `json:"promptName"`
		Arguments  map[string]string `json:"arguments"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	_, connected := services.GlobalMCPClients.Get(serverName)
	if !connected {
		if server := services.Store.GetServer(serverName); server != nil && server.URL != "" {
			ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
			defer cancel()
			if err := services.ConnectServerByName(ctx, serverName); err != nil {
				c.JSON(http.StatusServiceUnavailable, models.ApiResponse{
					Success: false,
					Message: "MCP server not connected: " + err.Error(),
				})
				return
			}
		} else {
			c.JSON(http.StatusServiceUnavailable, models.ApiResponse{
				Success: false,
				Message: "MCP server not connected",
			})
			return
		}
	}

	result, err := services.GlobalMCPClients.GetPrompt(c.Request.Context(), serverName, req.PromptName, req.Arguments)
	if err != nil {
		services.Store.AddLogEntry(&models.LogEntry{
			Type:    "error",
			Source:  "prompt",
			Message: "Prompt call failed: " + serverName + "/" + req.PromptName + ": " + err.Error(),
		})
		c.JSON(http.StatusInternalServerError, models.ApiResponse{
			Success: false,
			Message: err.Error(),
		})
		return
	}

	services.Store.AddLogEntry(&models.LogEntry{
		Type:    "info",
		Source:  "prompt",
		Message: "Prompt call: " + serverName + "/" + req.PromptName,
	})

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    result,
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
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data: map[string]interface{}{
			"autoLogin":     config.AppConfig.AutoLogin,
			"showLoginHint": config.AppConfig.ShowLoginHint,
			"permissions":   []string{},
			"betterAuth":    nil,
		},
	})
}

func GetTutorialConfig(c *gin.Context) {
	username, _ := c.Get("username")
	user := services.Store.GetUser(username.(string))
	if user == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{Success: false, Message: "User not found"})
		return
	}

	// Build the base MCP URL
	host := config.AppConfig.Host
	port := config.AppConfig.Port
	basePath := config.AppConfig.BasePath

	// If host is 0.0.0.0, use localhost for client config
	displayHost := host
	if host == "0.0.0.0" || host == "" {
		displayHost = "localhost"
	}

	mcpURL := "http://" + displayHost + ":" + port + basePath + "/mcp"

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data: map[string]interface{}{
			"username": user.Username,
			"key":      user.Key,
			"mcpURL":   mcpURL,
			"host":     displayHost,
			"port":     port,
			"basePath": basePath,
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
