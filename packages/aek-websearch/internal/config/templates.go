package config

import (
	"embed"
	"os"
	"path/filepath"
)

//go:embed templates/*.jsonc templates/*.txt
var templateFS embed.FS

// ── Config template generation ──────────────────────────────────────────────

// WriteTemplateFiles creates empty template files under ~/.aek/websearch/
// for settings and all provider key files. Existing files are NEVER overwritten.
// Returns the map of created files (path -> "settings" or "keys").
func WriteTemplateFiles() (map[string]string, error) {
	created := make(map[string]string)

	// Settings template (embedded file, copied verbatim).
	settingsPath := SettingsPath()
	if _, err := os.Stat(settingsPath); os.IsNotExist(err) {
		if err := copyEmbeddedTemplate(templateFS, "templates/websearch-settings.jsonc", settingsPath); err != nil {
			return created, err
		}
		created[settingsPath] = "settings"
	}

	// Per-provider key templates (shared template, copied per provider name).
	for _, name := range SupportedProviders() {
		path := filepath.Join(KeysDir(), name+".txt")
		if _, err := os.Stat(path); os.IsNotExist(err) {
			if err := copyEmbeddedTemplate(templateFS, "templates/provider-key.txt", path); err != nil {
				return created, err
			}
			created[path] = "keys"
		}
	}

	return created, nil
}

// copyEmbeddedTemplate reads a file from the embedded FS and writes it to dest.
func copyEmbeddedTemplate(fs embed.FS, src, dest string) error {
	data, err := fs.ReadFile(src)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	return os.WriteFile(dest, data, 0o644)
}