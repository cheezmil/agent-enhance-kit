package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/cheezmil/aek-mcp/internal/models"
)

// Market handlers
func GetAllMarketServers(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: []interface{}{}})
}
func SearchMarketServers(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: []interface{}{}})
}
func GetMarketServer(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: map[string]interface{}{"name": c.Param("serverName")}})
}
func GetAllMarketCategories(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: []interface{}{}})
}
func GetMarketServersByCategory(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: []interface{}{}})
}
func GetAllMarketTags(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: []interface{}{}})
}
func GetMarketServersByTag(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: []interface{}{}})
}

// Cloud handlers
func GetAllCloudServers(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: []interface{}{}})
}
func SearchCloudServers(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: []interface{}{}})
}
func GetCloudServer(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: map[string]interface{}{"name": c.Param("serverName")}})
}
func GetAllCloudCategories(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: []interface{}{}})
}
func GetCloudServersByCategory(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: []interface{}{}})
}
func GetAllCloudTags(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: []interface{}{}})
}
func GetCloudServersByTag(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: []interface{}{}})
}
func GetCloudServerTools(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: []interface{}{}})
}
func CallCloudTool(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    map[string]interface{}{"content": []map[string]string{{"type": "text", "text": "Cloud tool placeholder"}}},
	})
}

// Registry handlers
func GetAllRegistryServers(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: []interface{}{}})
}
func GetRegistryServerVersions(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: []interface{}{}})
}
func GetRegistryServerVersion(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: map[string]interface{}{}})
}

// Changelog handler
func GetChangelogUpdateInfo(c *gin.Context) {
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    map[string]interface{}{"hasUpdate": false},
	})
}
