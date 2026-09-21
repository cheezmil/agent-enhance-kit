package handlers

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"

	"github.com/cheezmil/aek-mcp/internal/models"
	"github.com/cheezmil/aek-mcp/internal/services"
)

// GetTutorialPrefs returns the user's persisted agent selection.
// GET /api/tutorial/prefs
func GetTutorialPrefs(c *gin.Context) {
	username, _ := c.Get("username")
	uName := username.(string)
	prefs := services.LoadTutorialPrefs(uName)
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    prefs,
	})
}

// SaveTutorialPrefs persists the user's agent selection.
// PUT /api/tutorial/prefs
// Body: { "selectedAgents": ["claude-code", "cursor"] }
func SaveTutorialPrefs(c *gin.Context) {
	username, _ := c.Get("username")
	uName := username.(string)

	var req models.TutorialPrefs
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false, Message: "Invalid request body",
		})
		return
	}

	if err := services.SaveTutorialPrefs(uName, &req); err != nil {
		c.JSON(http.StatusInternalServerError, models.ApiResponse{
			Success: false, Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    req,
	})
}

// ListTutorialAgents returns all supported agents with their install status.
// GET /api/tutorial/agents
func ListTutorialAgents(c *gin.Context) {
	type agentInfo struct {
		ID         string `json:"id"`
		Name       string `json:"name"`
		Path       string `json:"path"`
		Installed  bool   `json:"installed"`
		GUIOnly    bool   `json:"guiOnly"`
	}
	result := make([]agentInfo, 0, len(services.AgentTools))
	for _, t := range services.AgentTools {
		info := agentInfo{
			ID:      t.ID,
			Name:    t.Name,
			Path:    t.ConfigPath,
			GUIOnly: t.GUIOnly,
		}
		// Check if config file exists and has aek_mcp entry
		if t.GUIOnly || t.ConfigPath == "" {
			info.Installed = false
		} else {
			if _, err := statFile(t.ConfigPath); err == nil {
				hasEntry, _ := services.AgentHasEntry(&t)
				info.Installed = hasEntry
			}
		}
		result = append(result, info)
	}
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    result,
	})
}

// ApplyTutorialConfig writes aek-mcp into the selected agent config files.
// POST /api/tutorial/apply
// Body: { "agents": ["claude-code", "cursor"] }
func ApplyTutorialConfig(c *gin.Context) {
	username, _ := c.Get("username")
	uName := username.(string)

	var req struct {
		Agents []string `json:"agents"`
		Group  string   `json:"group,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false, Message: "Invalid request body",
		})
		return
	}

	if len(req.Agents) == 0 {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false, Message: "No agents specified",
		})
		return
	}

	// Build MCP URL from current user config
	user := services.Store.GetUser(uName)
	key := ""
	group := req.Group
	if user != nil {
		key = user.Key
	}
	mcpURL := services.BuildMcpURL(uName, key, group)

	results := make([]models.TutorialApplyResult, 0, len(req.Agents))
	for _, agentID := range req.Agents {
		tool := services.GetAgentTool(agentID)
		if tool == nil {
			results = append(results, models.TutorialApplyResult{
				AgentID: agentID, Name: agentID, Success: false, Message: "Unknown agent ID",
			})
			continue
		}
		if tool.GUIOnly {
			results = append(results, models.TutorialApplyResult{
				AgentID: agentID, Name: tool.Name, Skipped: true, Path: "GUI only",
				Message: "This tool has no config file; configure it manually via its GUI",
			})
			continue
		}

		// Backup existing config before writing
		if err := services.BackupConfig(tool.ConfigPath); err != nil {
			results = append(results, models.TutorialApplyResult{
				AgentID: agentID, Name: tool.Name, Success: false, Path: tool.ConfigPath,
				Message: "Backup failed: " + err.Error(),
			})
			continue
		}

		if err := services.InstallAgentToConfig(tool, mcpURL); err != nil {
			results = append(results, models.TutorialApplyResult{
				AgentID: agentID, Name: tool.Name, Success: false, Path: tool.ConfigPath,
				Message: err.Error(),
			})
			continue
		}
		results = append(results, models.TutorialApplyResult{
			AgentID: agentID, Name: tool.Name, Success: true, Path: tool.ConfigPath,
		})
	}

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    results,
	})
}

// RemoveTutorialConfig removes aek-mcp entries from agent config files.
// POST /api/tutorial/remove
// Body: { "agents": ["claude-code"] }
func RemoveTutorialConfig(c *gin.Context) {
	var req struct {
		Agents []string `json:"agents"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false, Message: "Invalid request body",
		})
		return
	}

	results := make([]models.TutorialApplyResult, 0, len(req.Agents))
	for _, agentID := range req.Agents {
		tool := services.GetAgentTool(agentID)
		if tool == nil {
			results = append(results, models.TutorialApplyResult{
				AgentID: agentID, Name: agentID, Success: false, Message: "Unknown agent ID",
			})
			continue
		}
		if tool.GUIOnly {
			results = append(results, models.TutorialApplyResult{
				AgentID: agentID, Name: tool.Name, Skipped: true, Path: "GUI only",
			})
			continue
		}

		if err := services.BackupConfig(tool.ConfigPath); err != nil {
			results = append(results, models.TutorialApplyResult{
				AgentID: agentID, Name: tool.Name, Success: false, Path: tool.ConfigPath,
				Message: "Backup failed: " + err.Error(),
			})
			continue
		}

		if err := services.RemoveAgentFromConfig(tool); err != nil {
			results = append(results, models.TutorialApplyResult{
				AgentID: agentID, Name: tool.Name, Success: false, Path: tool.ConfigPath,
				Message: err.Error(),
			})
			continue
		}
		results = append(results, models.TutorialApplyResult{
			AgentID: agentID, Name: tool.Name, Success: true, Path: tool.ConfigPath,
		})
	}

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    results,
	})
}

// statFile is a thin wrapper so tests can mock it.
var statFile = func(path string) (interface{}, error) {
	return os.Stat(path)
}

// checkHasEntry reads a config file and checks if the aek-mcp entry exists.
var checkHasEntry = func(path, _, _, _ string) (bool, error) {
	tool := services.GetAgentToolByPath(path)
	if tool == nil {
		return false, nil
	}
	return services.AgentHasEntry(tool)
}