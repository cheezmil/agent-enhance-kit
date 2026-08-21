package services

import (
	"embed"
	"os"
	"path/filepath"

	"github.com/cheezmil/aek-mcp/internal/config"
)

//go:embed templates
var defaultTemplateFS embed.FS

// WriteDefaultConfigFiles creates default settings.jsonc / user.jsonc / data.json
// under ~/.aek/mcp when missing. Existing files are NEVER overwritten.
// Returns the map of created files (dest path -> template name).
func WriteDefaultConfigFiles() (map[string]string, error) {
	created := make(map[string]string)

	dests := map[string]string{
		"templates/settings.jsonc": config.GetSettingsPath(),
		"templates/user.jsonc":     getUserFilePath(),
		"templates/data.json":      getDataFilePath(),
	}

	for src, dest := range dests {
		if _, err := os.Stat(dest); os.IsNotExist(err) {
			if err := copyDefaultTemplate(src, dest); err != nil {
				return created, err
			}
			created[dest] = src
		}
	}

	return created, nil
}

// copyDefaultTemplate reads a file from the embedded FS and writes it to dest.
func copyDefaultTemplate(src, dest string) error {
	data, err := defaultTemplateFS.ReadFile(src)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	return os.WriteFile(dest, data, 0o644)
}

// InitConfigDirs creates the settings/user-custom-configuration directory tree
// so per-user config files have a home on first run.
func InitConfigDirs() error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	dir := filepath.Join(home, ".aek", "mcp", "settings", "user-custom-configuration")
	return os.MkdirAll(dir, 0o755)
}