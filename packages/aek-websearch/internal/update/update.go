package update

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/fatih/color"
)

const (
	githubRepo  = "cheezmil/agent-enhance-kit"
	githubAPI   = "https://api.github.com/repos/" + githubRepo + "/releases/latest"
	checkInterval = 24 * time.Hour
)

// VersionInfo holds version comparison data
type VersionInfo struct {
	Current   string
	Latest    string
	NeedsUpdate bool
}

// GitHubRelease represents GitHub release API response
type GitHubRelease struct {
	TagName string `json:"tag_name"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

// CheckForUpdate checks if a new version is available
func CheckForUpdate(currentVersion string) (*VersionInfo, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(githubAPI)
	if err != nil {
		return nil, fmt.Errorf("failed to check for updates: %w", err)
	}
	defer resp.Body.Close()

	// If no releases exist yet, silently return no update needed
	if resp.StatusCode == http.StatusNotFound {
		return &VersionInfo{
			Current:     currentVersion,
			Latest:      currentVersion,
			NeedsUpdate: false,
		}, nil
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("failed to parse release info: %w", err)
	}

	latestVersion := strings.TrimPrefix(release.TagName, "v")
	currentVersion = strings.TrimPrefix(currentVersion, "v")

	needsUpdate := compareVersions(latestVersion, currentVersion) > 0

	return &VersionInfo{
		Current:     currentVersion,
		Latest:      latestVersion,
		NeedsUpdate: needsUpdate,
	}, nil
}

// compareVersions compares two semver strings
// Returns: 1 if a > b, -1 if a < b, 0 if equal
func compareVersions(a, b string) int {
	aParts := parseVersion(a)
	bParts := parseVersion(b)

	for i := 0; i < 3; i++ {
		if aParts[i] > bParts[i] {
			return 1
		}
		if aParts[i] < bParts[i] {
			return -1
		}
	}
	return 0
}

func parseVersion(v string) [3]int {
	var parts [3]int
	v = strings.TrimPrefix(v, "v")
	for i := 0; i < 3; i++ {
		idx := strings.Index(v, ".")
		if idx == -1 {
			fmt.Sscanf(v, "%d", &parts[i])
			break
		}
		fmt.Sscanf(v[:idx], "%d", &parts[i])
		v = v[idx+1:]
	}
	return parts
}

// GetBinaryName returns the binary name for the current platform
func GetBinaryName() string {
	if runtime.GOOS == "windows" {
		return "aek.exe"
	}
	return "aek"
}

// GetAssetName returns the expected asset filename for the current platform
func GetAssetName() string {
	goos := runtime.GOOS
	goarch := runtime.GOARCH

	// GoReleaser uses standard Go arch names (amd64, arm64)
	// Windows gets .zip, others get .tar.gz
	if goos == "windows" {
		return fmt.Sprintf("aek-%s-%s.zip", goos, goarch)
	}
	return fmt.Sprintf("aek-%s-%s.tar.gz", goos, goarch)
}

// GetCurrentExecutable returns the path to the current running binary
func GetCurrentExecutable() (string, error) {
	return os.Executable()
}

// DownloadAndReplace downloads the latest release and replaces the current binary
func DownloadAndReplace(version string) error {
	client := &http.Client{Timeout: 120 * time.Second}

	// Get release info
	resp, err := client.Get(githubAPI)
	if err != nil {
		return fmt.Errorf("failed to fetch release info: %w", err)
	}
	defer resp.Body.Close()

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return fmt.Errorf("failed to parse release: %w", err)
	}

	// Find the asset for current platform
	assetName := GetAssetName()
	var downloadURL string
	for _, asset := range release.Assets {
		if asset.Name == assetName {
			downloadURL = asset.BrowserDownloadURL
			break
		}
	}

	if downloadURL == "" {
		return fmt.Errorf("no binary found for %s/%s", runtime.GOOS, runtime.GOARCH)
	}

	// Get current executable path
	execPath, err := GetCurrentExecutable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}

	// Create temp directory for download
	tmpDir, err := os.MkdirTemp("", "aek-update-*")
	if err != nil {
		return fmt.Errorf("failed to create temp dir: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	// Download the archive
	archivePath := filepath.Join(tmpDir, assetName)
	if err := downloadFile(client, downloadURL, archivePath); err != nil {
		return fmt.Errorf("failed to download: %w", err)
	}

	// Extract binary from archive
	binaryData, err := extractBinary(archivePath, assetName)
	if err != nil {
		return fmt.Errorf("failed to extract binary: %w", err)
	}

	// Create backup
	backupPath := execPath + ".bak"
	if err := copyFile(execPath, backupPath); err != nil {
		// Non-fatal, continue
		fmt.Fprintf(os.Stderr, "Warning: failed to create backup: %v\n", err)
	}

	// Write new binary
	if err := writeExecutable(execPath, binaryData); err != nil {
		// Try to restore backup
		if bErr := os.Rename(backupPath, execPath); bErr != nil {
			return fmt.Errorf("failed to write binary and restore failed: %w", err)
		}
		return fmt.Errorf("failed to write binary: %w", err)
	}

	// Remove backup on success
	os.Remove(backupPath)

	return nil
}

func downloadFile(client *http.Client, url, dest string) error {
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed with status %d", resp.StatusCode)
	}

	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

func extractBinary(archivePath, assetName string) ([]byte, error) {
	if strings.HasSuffix(assetName, ".zip") {
		return extractFromZip(archivePath)
	}
	return extractFromTarGz(archivePath)
}

func extractFromTarGz(archivePath string) ([]byte, error) {
	// Use system tar command
	cmd := exec.Command("tar", "-xzf", archivePath, "-C", filepath.Dir(archivePath), GetBinaryName())
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("tar extraction failed: %w", err)
	}

	binaryPath := filepath.Join(filepath.Dir(archivePath), GetBinaryName())
	data, err := os.ReadFile(binaryPath)
	if err != nil {
		return nil, err
	}
	return data, nil
}

func extractFromZip(archivePath string) ([]byte, error) {
	// Use system unzip command
	cmd := exec.Command("unzip", "-o", archivePath, "-d", filepath.Dir(archivePath))
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("unzip extraction failed: %w", err)
	}

	binaryPath := filepath.Join(filepath.Dir(archivePath), GetBinaryName())
	data, err := os.ReadFile(binaryPath)
	if err != nil {
		return nil, err
	}
	return data, nil
}

func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	return err
}

func writeExecutable(path string, data []byte) error {
	// Write to temp file first, then rename (atomic on most systems)
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0755); err != nil {
		return err
	}

	// On Windows, need to remove existing file first
	if runtime.GOOS == "windows" {
		os.Remove(path)
	}

	return os.Rename(tmpPath, path)
}

// PrintUpdateMessage prints a colorful update available message
func PrintUpdateMessage(info *VersionInfo) {
	green := color.New(color.FgGreen).SprintFunc()
	cyan := color.New(color.FgCyan).SprintFunc()
	yellow := color.New(color.FgYellow).SprintFunc()

	fmt.Printf("\n%s %s → %s\n",
		yellow("⬆  New version available:"),
		cyan(info.Current),
		green(info.Latest),
	)
	fmt.Printf("   Run %s to update\n\n", cyan("aek update"))
}
