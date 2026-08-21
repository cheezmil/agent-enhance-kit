package services

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/cheezmil/aek-mcp/internal/models"
)

// tutorialPrefsFileName is the per-user JSONC holding one-click install
// preferences (which agents the user selected for aek-mcp configuration).
const tutorialPrefsFileName = "tutorial.jsonc"

func tutorialPrefsFilePath(username string) string {
	return filepath.Join(userCustomConfigDir(username), tutorialPrefsFileName)
}

// LoadTutorialPrefs returns the persisted agent selection for a user.
// Missing/invalid file yields empty prefs (no error).
func LoadTutorialPrefs(username string) *models.TutorialPrefs {
	prefs := &models.TutorialPrefs{SelectedAgents: []string{}}
	if username == "" {
		return prefs
	}
	data, err := os.ReadFile(tutorialPrefsFilePath(username))
	if err != nil {
		return prefs
	}
	var parsed models.TutorialPrefs
	if err := json.Unmarshal(data, &parsed); err != nil {
		cleaned := StripJsoncComments(string(data))
		if err2 := json.Unmarshal([]byte(cleaned), &parsed); err2 != nil {
			return prefs
		}
	}
	if parsed.SelectedAgents == nil {
		parsed.SelectedAgents = []string{}
	}
	return &parsed
}

// SaveTutorialPrefs persists the agent selection for a user.
func SaveTutorialPrefs(username string, prefs *models.TutorialPrefs) error {
	if username == "" {
		return fmt.Errorf("username required")
	}
	if prefs == nil {
		prefs = &models.TutorialPrefs{SelectedAgents: []string{}}
	}
	if prefs.SelectedAgents == nil {
		prefs.SelectedAgents = []string{}
	}
	if err := os.MkdirAll(userCustomConfigDir(username), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(prefs, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(tutorialPrefsFilePath(username), data, 0644)
}