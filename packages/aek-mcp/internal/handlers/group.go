package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/cheezmil/aek-mcp/internal/models"
	"github.com/cheezmil/aek-mcp/internal/services"
)

func GetGroups(c *gin.Context) {
	groups := services.Store.GetAllGroups()
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    groups,
	})
}

func GetGroup(c *gin.Context) {
	id := c.Param("groupId")
	group := services.Store.GetGroup(id)
	if group == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "Group not found",
		})
		return
	}
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: group})
}

func CreateGroup(c *gin.Context) {
	var group models.Group
	if err := c.ShouldBindJSON(&group); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{Success: false, Message: "Invalid request body"})
		return
	}
	if group.ID == "" {
		group.ID = uuid.New().String()
	}
	if group.Servers == nil {
		group.Servers = []string{}
	}
	group.CreatedAt = time.Now()
	group.UpdatedAt = time.Now()
	services.Store.CreateGroup(&group)
	c.JSON(http.StatusCreated, models.ApiResponse{Success: true, Data: group})
}

func BatchCreateGroups(c *gin.Context) {
	var groups []models.Group
	if err := c.ShouldBindJSON(&groups); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{Success: false, Message: "Invalid request body"})
		return
	}
	for i := range groups {
		if groups[i].ID == "" {
			groups[i].ID = uuid.New().String()
		}
		if groups[i].Servers == nil {
			groups[i].Servers = []string{}
		}
		groups[i].CreatedAt = time.Now()
		groups[i].UpdatedAt = time.Now()
		services.Store.CreateGroup(&groups[i])
	}
	c.JSON(http.StatusCreated, models.ApiResponse{Success: true, Data: groups})
}

func UpdateGroup(c *gin.Context) {
	id := c.Param("groupId")
	existing := services.Store.GetGroup(id)
	if existing == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{Success: false, Message: "Group not found"})
		return
	}
	var group models.Group
	if err := c.ShouldBindJSON(&group); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{Success: false, Message: "Invalid request body"})
		return
	}
	group.ID = id
	group.CreatedAt = existing.CreatedAt
	group.UpdatedAt = time.Now()
	if group.Servers == nil {
		group.Servers = []string{}
	}
	services.Store.UpdateGroup(id, &group)
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: group})
}

func DeleteGroup(c *gin.Context) {
	id := c.Param("groupId")
	if services.Store.GetGroup(id) == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{Success: false, Message: "Group not found"})
		return
	}
	services.Store.DeleteGroup(id)
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Message: "Group deleted"})
}

func AddServerToGroup(c *gin.Context) {
	id := c.Param("groupId")
	group := services.Store.GetGroup(id)
	if group == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{Success: false, Message: "Group not found"})
		return
	}
	var req struct {
		ServerName string `json:"serverName"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{Success: false, Message: "Invalid request body"})
		return
	}
	for _, s := range group.Servers {
		if s == req.ServerName {
			c.JSON(http.StatusConflict, models.ApiResponse{Success: false, Message: "Server already in group"})
			return
		}
	}
	group.Servers = append(group.Servers, req.ServerName)
	group.UpdatedAt = time.Now()
	services.Store.UpdateGroup(id, group)
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: group})
}

func RemoveServerFromGroup(c *gin.Context) {
	id := c.Param("groupId")
	serverName := c.Param("serverName")
	group := services.Store.GetGroup(id)
	if group == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{Success: false, Message: "Group not found"})
		return
	}
	for i, s := range group.Servers {
		if s == serverName {
			group.Servers = append(group.Servers[:i], group.Servers[i+1:]...)
			break
		}
	}
	group.UpdatedAt = time.Now()
	services.Store.UpdateGroup(id, group)
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: group})
}

func GetGroupServers(c *gin.Context) {
	id := c.Param("groupId")
	group := services.Store.GetGroup(id)
	if group == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{Success: false, Message: "Group not found"})
		return
	}
	servers := make([]*models.ServerConfig, 0)
	for _, serverName := range group.Servers {
		if server := services.Store.GetServer(serverName); server != nil {
			servers = append(servers, server)
		}
	}
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: servers})
}

func UpdateGroupServersBatch(c *gin.Context) {
	id := c.Param("groupId")
	group := services.Store.GetGroup(id)
	if group == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{Success: false, Message: "Group not found"})
		return
	}
	var req struct {
		Servers []string `json:"servers"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{Success: false, Message: "Invalid request body"})
		return
	}
	group.Servers = req.Servers
	group.UpdatedAt = time.Now()
	services.Store.UpdateGroup(id, group)
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: group})
}

func GetGroupServerConfigs(c *gin.Context) {
	id := c.Param("groupId")
	group := services.Store.GetGroup(id)
	if group == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{Success: false, Message: "Group not found"})
		return
	}
	configs := make(map[string]*models.ServerConfig)
	for _, serverName := range group.Servers {
		if server := services.Store.GetServer(serverName); server != nil {
			configs[serverName] = server
		}
	}
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: configs})
}

func GetGroupServerConfig(c *gin.Context) {
	serverName := c.Param("serverName")
	server := services.Store.GetServer(serverName)
	if server == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{Success: false, Message: "Server not found"})
		return
	}
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: server})
}

func UpdateGroupServerTools(c *gin.Context) {
	serverName := c.Param("serverName")
	server := services.Store.GetServer(serverName)
	if server == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{Success: false, Message: "Server not found"})
		return
	}
	var req struct {
		Tools []models.ToolConfig `json:"tools"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{Success: false, Message: "Invalid request body"})
		return
	}
	server.Tools = req.Tools
	services.Store.UpdateServer(serverName, server)
	c.JSON(http.StatusOK, models.ApiResponse{Success: true, Data: server})
}
