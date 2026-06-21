package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/cheezmil/aek-mcp/internal/models"
	"github.com/cheezmil/aek-mcp/internal/services"
)

func CheckActivityAvailable(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    map[string]interface{}{"available": false},
	})
}

func GetActivities(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 20
	}
	activities, total := services.Store.GetActivities(page, limit)
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    activities,
	})
	_ = total
}

func GetActivityStats(c *gin.Context) {
	_, total := services.Store.GetActivities(1, 1)
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data: map[string]interface{}{
			"totalCalls":   total,
			"successCalls": total,
			"failedCalls":  0,
			"avgDuration":  0,
		},
	})
}

func GetActivityFilterOptions(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data: map[string]interface{}{
			"servers": []interface{}{},
			"tools":   []interface{}{},
			"groups":  []interface{}{},
			"users":   []interface{}{},
		},
	})
}

func GetActivityByID(c *gin.Context) {
	id := c.Param("activityId")
	activity := services.Store.GetActivityByID(id)
	if activity == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{Success: false, Message: "Activity not found"})
		return
	}
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: activity})
}

func DeleteOldActivities(c *gin.Context) {
	daysOld, _ := strconv.Atoi(c.DefaultQuery("daysOld", "30"))
	cutoffDate := time.Now().AddDate(0, 0, -daysOld)
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data: map[string]interface{}{
			"deletedCount": 0,
			"cutoffDate":   cutoffDate.Format(time.RFC3339),
		},
	})
}

func GetLogs(c *gin.Context) {
	logs := services.Store.GetAllLogs()
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: logs})
}

func ClearLogs(c *gin.Context) {
	services.Store.ClearLogs()
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Message: "Logs cleared"})
}

func StreamLogs(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusUnauthorized, models.ApiResponse{Success: false, Message: "Token required"})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, models.ApiResponse{Success: false, Message: "Streaming not supported"})
		return
	}

	// Send initial logs
	logs := services.Store.GetAllLogs()
	c.Writer.Write([]byte("data: {\"type\":\"initial\",\"logs\":"))
	logData, _ := json.Marshal(logs)
	c.Writer.Write(logData)
	c.Writer.Write([]byte("}\n\n"))
	flusher.Flush()

	// Subscribe to new logs
	ch := services.Store.SubscribeToLogs()
	defer services.Store.UnsubscribeFromLogs(ch)

	c.Request.Context().Done()

	for {
		select {
		case entry := <-ch:
			logJSON, _ := json.Marshal(entry)
			c.Writer.Write([]byte("data: {\"type\":\"log\",\"log\":"))
			c.Writer.Write(logJSON)
			c.Writer.Write([]byte("}\n\n"))
			flusher.Flush()
		case <-c.Request.Context().Done():
			return
		}
	}
}

func ListBuiltinPrompts(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: []interface{}{}})
}

func GetBuiltinPrompt(c *gin.Context) {
	id := c.Param("promptId")
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    map[string]interface{}{"id": id},
	})
}

func CreateBuiltinPrompt(c *gin.Context) {
	c.JSON(http.StatusCreated, models.ApiResponse{Success: true, Data: map[string]interface{}{}})
}

func UpdateBuiltinPrompt(c *gin.Context) {
	id := c.Param("promptId")
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    map[string]interface{}{"id": id},
	})
}

func DeleteBuiltinPrompt(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Message: "Deleted"})
}

func ListBuiltinResources(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: []interface{}{}})
}

func GetBuiltinResource(c *gin.Context) {
	id := c.Param("resourceId")
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    map[string]interface{}{"id": id},
	})
}

func CreateBuiltinResource(c *gin.Context) {
	c.JSON(http.StatusCreated, models.ApiResponse{Success: true, Data: map[string]interface{}{}})
}

func UpdateBuiltinResource(c *gin.Context) {
	id := c.Param("resourceId")
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    map[string]interface{}{"id": id},
	})
}

func DeleteBuiltinResource(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Message: "Deleted"})
}

func ReadResource(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    map[string]interface{}{"contents": []interface{}{}},
	})
}

func UploadMcpbFile(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Message: "Uploaded"})
}

func GetBearerKeys(c *gin.Context) {
	keys := services.Store.GetAllBearerKeys()
	result := make([]*models.BearerKey, 0, len(keys))
	for _, k := range keys {
		if k.Token == "" {
			k.Token = k.Key
		}
		if k.Kind == "" {
			k.Kind = "user"
		}
		if k.Owner == "" {
			k.Owner = "default"
		}
		if k.AccessType == "" {
			k.AccessType = "all"
		}
		result = append(result, k)
	}
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: result})
}

func CreateBearerKey(c *gin.Context) {
	var req struct {
		Name  string `json:"name"`
		Scope string `json:"scope"`
		Kind  string `json:"kind"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{Success: false, Message: "Invalid request body"})
		return
	}
	if req.Name == "" {
		req.Name = "key-" + uuid.New().String()[:8]
	}
	token := "mcphub_" + uuid.New().String()
	kind := req.Kind
	if kind == "" {
		kind = "user"
	}
	key := &models.BearerKey{
		ID:         uuid.New().String(),
		Name:       req.Name,
		Key:        token,
		Token:      token,
		Scope:      req.Scope,
		Kind:       kind,
		Owner:      "default",
		AccessType: "all",
		Enabled:    true,
		CreatedAt:  time.Now(),
	}
	services.Store.CreateBearerKey(key)
	c.JSON(http.StatusCreated, models.ApiResponse{Success: true, Data: key})
}

func UpdateBearerKey(c *gin.Context) {
	id := c.Param("keyId")
	existing := services.Store.GetBearerKey(id)
	if existing == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{Success: false, Message: "Bearer key not found"})
		return
	}
	var req struct {
		Name    string `json:"name"`
		Enabled *bool  `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{Success: false, Message: "Invalid request body"})
		return
	}
	if req.Name != "" {
		existing.Name = req.Name
	}
	if req.Enabled != nil {
		existing.Enabled = *req.Enabled
	}
	services.Store.UpdateBearerKey(id, existing)
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: existing})
}

func DeleteBearerKey(c *gin.Context) {
	id := c.Param("keyId")
	if services.Store.GetBearerKey(id) == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{Success: false, Message: "Bearer key not found"})
		return
	}
	services.Store.DeleteBearerKey(id)
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Message: "Deleted"})
}

func GetAllClients(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: []interface{}{}})
}

func GetClient(c *gin.Context) {
	clientId := c.Param("clientId")
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: map[string]interface{}{"clientId": clientId}})
}

func CreateClient(c *gin.Context) {
	c.JSON(http.StatusCreated, models.ApiResponse{Success: true, Data: map[string]interface{}{}})
}

func UpdateClient(c *gin.Context) {
	clientId := c.Param("clientId")
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: map[string]interface{}{"clientId": clientId}})
}

func DeleteClient(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Message: "Deleted"})
}

func RegenerateSecret(c *gin.Context) {
	clientId := c.Param("clientId")
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data: map[string]interface{}{
			"clientId":     clientId,
			"clientSecret": uuid.New().String(),
		},
	})
}

func GetAuthorize(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: false, Message: "OAuth not configured"})
}

func PostAuthorize(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: false, Message: "OAuth not configured"})
}

func PostToken(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: false, Message: "OAuth not configured"})
}

func GetUserInfo(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: false, Message: "OAuth not configured"})
}

func GetMetadata(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: map[string]interface{}{}})
}

func GetProtectedResourceMetadata(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: map[string]interface{}{}})
}

func RegisterClient(c *gin.Context) {
	c.JSON(http.StatusCreated, models.ApiResponse{Success: true, Data: map[string]interface{}{}})
}

func GetClientConfiguration(c *gin.Context) {
	clientId := c.Param("clientId")
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: map[string]interface{}{"clientId": clientId}})
}

func UpdateClientConfiguration(c *gin.Context) {
	clientId := c.Param("clientId")
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: map[string]interface{}{"clientId": clientId}})
}

func DeleteClientRegistration(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Message: "Deleted"})
}

func ReceiveHostedInternalEvent(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Message: "Event received"})
}

func GetHostedInternalRuntimeCatalog(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: map[string]interface{}{}})
}

func HandleOAuthCallback(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: false, Message: "OAuth not configured"})
}

func GetOAuthRouter(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: false, Message: "OAuth not configured"})
}

func GetBetterAuthUser(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: false, Message: "Better Auth not configured"})
}

func GetMcpSettingsJson(c *gin.Context) {
	servers := services.Store.GetAllServers()
	groups := services.Store.GetAllGroups()
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data: map[string]interface{}{
			"servers": servers,
			"groups":  groups,
		},
	})
}

func GetOpenAPISpec(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data: map[string]interface{}{
			"openapi": "3.0.0",
			"info":    map[string]interface{}{"title": "MCPHub API", "version": "1.0.0"},
		},
	})
}

func GetOpenAPIServers(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: []interface{}{}})
}

func GetOpenAPIStats(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: map[string]interface{}{}})
}

func ExecuteToolViaOpenAPI(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    map[string]interface{}{"content": []map[string]string{{"type": "text", "text": "Placeholder"}}},
	})
}

func GetGroupOpenAPISpec(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data: map[string]interface{}{
			"openapi": "3.0.0",
			"info":    map[string]interface{}{"title": "MCPHub Group API", "version": "1.0.0"},
		},
	})
}

func ListDiscoveryServers(c *gin.Context) {
	c.JSON(http.StatusNotFound, models.ApiResponse{Success: false, Message: "Discovery not enabled"})
}

func GetDiscoveryServer(c *gin.Context) {
	c.JSON(http.StatusNotFound, models.ApiResponse{Success: false, Message: "Discovery not enabled"})
}

func GetDiscoveryServerInstall(c *gin.Context) {
	c.JSON(http.StatusNotFound, models.ApiResponse{Success: false, Message: "Discovery not enabled"})
}

func ListDiscoveryCategories(c *gin.Context) {
	c.JSON(http.StatusNotFound, models.ApiResponse{Success: false, Message: "Discovery not enabled"})
}

func ListDiscoveryTags(c *gin.Context) {
	c.JSON(http.StatusNotFound, models.ApiResponse{Success: false, Message: "Discovery not enabled"})
}

func GetMarketplaceWellKnown(c *gin.Context) {
	c.JSON(http.StatusNotFound, models.ApiResponse{Success: false, Message: "Marketplace not enabled"})
}

func getMcpSettingsFilePath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".aek", "mcp", "mcp-settings.jsonc")
}

func GetMcpSettingsRaw(c *gin.Context) {
	path := getMcpSettingsFilePath()
	data, err := os.ReadFile(path)
	if err != nil {
		c.JSON(http.StatusOK, models.ApiResponse{
			Success: true,
			Data:    map[string]interface{}{"content": "", "path": path},
		})
		return
	}
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    map[string]interface{}{"content": string(data), "path": path},
	})
}

func SaveMcpSettingsRaw(c *gin.Context) {
	var req struct {
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{Success: false, Message: "Invalid request"})
		return
	}

	path := getMcpSettingsFilePath()
	if err := os.WriteFile(path, []byte(req.Content), 0644); err != nil {
		c.JSON(http.StatusInternalServerError, models.ApiResponse{Success: false, Message: "Failed to write file: " + err.Error()})
		return
	}

	// Reload: disconnect all, clear, re-import from file, reconnect
	for _, s := range services.Store.GetAllServers() {
		services.GlobalMCPClients.Disconnect(s.Name)
		services.Store.DeleteServer(s.Name)
	}
	services.LoadMcpSettings()

	// Reconnect enabled servers in background
	go func() {
		for _, s := range services.Store.GetAllServers() {
			if s.Enabled {
				if err := services.ConnectServerByName(context.Background(), s.Name); err != nil {
					fmt.Printf("[aek-mcp] Failed to reconnect server %s: %v\n", s.Name, err)
				}
			}
		}
	}()

	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Message: "Settings saved and reloaded"})
}
