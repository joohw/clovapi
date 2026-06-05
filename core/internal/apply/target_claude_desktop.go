package apply

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/profile"
)

const (
	claudeDesktopProfileID   = "00000000-0000-4000-8000-000000274830"
	claudeDesktopProfileName = "clovapi"
	envClaudeDesktopDir      = "CLOVAPI_SWITCHER_CLAUDE_DESKTOP_DIR"
)

type claudeDesktopTarget struct{}

type claudeDesktopPaths struct {
	normalConfigPath string
	threepConfigPath string
	profilePath      string
	metaPath         string
}

type claudeDesktopSnapshot struct {
	path    string
	exists  bool
	content []byte
}

func (claudeDesktopTarget) Kind() agentkind.Kind { return agentkind.ClaudeDesktop }

func (claudeDesktopTarget) SupportedStyles() []apistyle.Style {
	return []apistyle.Style{apistyle.Claude}
}

func (claudeDesktopTarget) Description() string {
	return "Claude Desktop 3P gateway config in Claude-3p/configLibrary (inferenceGatewayBaseUrl)"
}

func (claudeDesktopTarget) Installed() bool {
	for _, path := range claudeDesktopAppPaths() {
		if regularFile(path) || directoryExists(path) {
			return true
		}
	}
	return false
}

func (claudeDesktopTarget) Apply(p profile.Profile) error {
	if p.CLI != agentkind.ClaudeDesktop || p.APIStyle != apistyle.Claude {
		return errWrongAdapter("claudedesktop", "claude", p)
	}
	paths, err := ClaudeDesktopPaths()
	if err != nil {
		return err
	}
	return withClaudeDesktopRollback(paths, func() error {
		profileJSON := claudeDesktopGatewayProfile(ensureAnthropicWireBaseURL(p.BaseURL), p.APIKey, profile.ClaudeDesktopRouteName(p.Model, 0))
		if err := writeClaudeDesktopDeploymentMode(paths.normalConfigPath, "3p"); err != nil {
			return err
		}
		if err := writeClaudeDesktopDeploymentMode(paths.threepConfigPath, "3p"); err != nil {
			return err
		}
		if err := writeJSONAtomic(paths.profilePath, profileJSON, 0o600); err != nil {
			return err
		}
		return writeClaudeDesktopMeta(paths.metaPath, true)
	})
}

func (claudeDesktopTarget) ResetDefault() error {
	paths, err := ClaudeDesktopPaths()
	if err != nil {
		return err
	}
	return withClaudeDesktopRollback(paths, func() error {
		if err := writeClaudeDesktopDeploymentMode(paths.normalConfigPath, "1p"); err != nil {
			return err
		}
		if err := writeClaudeDesktopDeploymentMode(paths.threepConfigPath, "1p"); err != nil {
			return err
		}
		if err := os.Remove(paths.profilePath); err != nil && !os.IsNotExist(err) {
			return err
		}
		return writeClaudeDesktopMeta(paths.metaPath, false)
	})
}

func ClaudeDesktopPaths() (claudeDesktopPaths, error) {
	if root := strings.TrimSpace(os.Getenv(envClaudeDesktopDir)); root != "" {
		return claudeDesktopPathsFromDirs(filepath.Join(root, "Claude"), filepath.Join(root, "Claude-3p")), nil
	}
	switch runtime.GOOS {
	case "darwin":
		h, err := userHome()
		if err != nil {
			return claudeDesktopPaths{}, err
		}
		appSupport := filepath.Join(h, "Library", "Application Support")
		return claudeDesktopPathsFromDirs(filepath.Join(appSupport, "Claude"), filepath.Join(appSupport, "Claude-3p")), nil
	case "windows":
		local := strings.TrimSpace(os.Getenv("LOCALAPPDATA"))
		if local == "" {
			h, err := userHome()
			if err != nil {
				return claudeDesktopPaths{}, err
			}
			local = filepath.Join(h, "AppData", "Local")
		}
		return claudeDesktopPathsFromDirs(filepath.Join(local, "Claude"), filepath.Join(local, "Claude-3p")), nil
	default:
		return claudeDesktopPaths{}, fmt.Errorf("Claude Desktop 3P configuration is only supported on macOS and Windows")
	}
}

func ClaudeDesktopProfilePath() (string, error) {
	paths, err := ClaudeDesktopPaths()
	if err != nil {
		return "", err
	}
	return paths.profilePath, nil
}

func claudeDesktopAppPaths() []string {
	switch runtime.GOOS {
	case "darwin":
		h, _ := userHome()
		paths := []string{
			"/Applications/Claude.app",
		}
		if strings.TrimSpace(h) != "" {
			paths = append(paths, filepath.Join(h, "Applications", "Claude.app"))
		}
		return paths
	case "windows":
		var paths []string
		if local := strings.TrimSpace(os.Getenv("LOCALAPPDATA")); local != "" {
			paths = append(paths,
				filepath.Join(local, "Programs", "Claude", "Claude.exe"),
				filepath.Join(local, "Claude", "Claude.exe"),
			)
		}
		for _, env := range []string{"ProgramFiles", "ProgramFiles(x86)"} {
			if root := strings.TrimSpace(os.Getenv(env)); root != "" {
				paths = append(paths, filepath.Join(root, "Claude", "Claude.exe"))
			}
		}
		return paths
	default:
		return nil
	}
}

func directoryExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func claudeDesktopPathsFromDirs(normalDir, threepDir string) claudeDesktopPaths {
	library := filepath.Join(threepDir, "configLibrary")
	return claudeDesktopPaths{
		normalConfigPath: filepath.Join(normalDir, "claude_desktop_config.json"),
		threepConfigPath: filepath.Join(threepDir, "claude_desktop_config.json"),
		profilePath:      filepath.Join(library, claudeDesktopProfileID+".json"),
		metaPath:         filepath.Join(library, "_meta.json"),
	}
}

func claudeDesktopGatewayProfile(baseURL, apiKey, model string) map[string]any {
	root := map[string]any{
		"coworkEgressAllowedHosts":     []string{"*"},
		"disableDeploymentModeChooser": true,
		"inferenceGatewayApiKey":       strings.TrimSpace(apiKey),
		"inferenceGatewayAuthScheme":   "bearer",
		"inferenceGatewayBaseUrl":      strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		"inferenceProvider":            "gateway",
	}
	if m := strings.TrimSpace(model); m != "" {
		root["inferenceModels"] = []any{map[string]any{"name": m}}
	}
	return root
}

func writeClaudeDesktopDeploymentMode(path, mode string) error {
	root, err := readJSONObjectOrEmpty(path)
	if err != nil {
		return err
	}
	root["deploymentMode"] = mode
	return writeJSONAtomic(path, root, 0o600)
}

func writeClaudeDesktopMeta(path string, applied bool) error {
	root, err := readJSONObjectOrEmpty(path)
	if err != nil {
		return err
	}
	entries := jsonArray(root["entries"])
	filtered := make([]any, 0, len(entries)+1)
	for _, entry := range entries {
		m, _ := entry.(map[string]any)
		if m != nil && m["id"] == claudeDesktopProfileID {
			continue
		}
		filtered = append(filtered, entry)
	}
	if applied {
		filtered = append(filtered, map[string]any{"id": claudeDesktopProfileID, "name": claudeDesktopProfileName})
		root["appliedId"] = claudeDesktopProfileID
	} else if root["appliedId"] == claudeDesktopProfileID {
		delete(root, "appliedId")
	}
	root["entries"] = filtered
	return writeJSONAtomic(path, root, 0o600)
}

func readJSONObjectOrEmpty(path string) (map[string]any, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]any{}, nil
		}
		return nil, err
	}
	if len(data) == 0 {
		return map[string]any{}, nil
	}
	var root map[string]any
	if err := json.Unmarshal(data, &root); err != nil {
		return nil, fmt.Errorf("parse existing %s: %w (refusing to overwrite; fix or remove the file)", path, err)
	}
	if root == nil {
		root = map[string]any{}
	}
	return root, nil
}

func jsonArray(v any) []any {
	if xs, ok := v.([]any); ok {
		return xs
	}
	return nil
}

func writeJSONAtomic(path string, v any, perm os.FileMode) error {
	out, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(path, out, perm)
}

func withClaudeDesktopRollback(paths claudeDesktopPaths, op func() error) error {
	snapshots, err := snapshotClaudeDesktopFiles(paths)
	if err != nil {
		return err
	}
	if err := op(); err != nil {
		if rollbackErr := restoreClaudeDesktopSnapshots(snapshots); rollbackErr != nil {
			return fmt.Errorf("%w; rollback failed: %v", err, rollbackErr)
		}
		return err
	}
	return nil
}

func snapshotClaudeDesktopFiles(paths claudeDesktopPaths) ([]claudeDesktopSnapshot, error) {
	files := []string{paths.normalConfigPath, paths.threepConfigPath, paths.profilePath, paths.metaPath}
	out := make([]claudeDesktopSnapshot, 0, len(files))
	for _, path := range files {
		data, err := os.ReadFile(path)
		if err != nil {
			if os.IsNotExist(err) {
				out = append(out, claudeDesktopSnapshot{path: path})
				continue
			}
			return nil, err
		}
		out = append(out, claudeDesktopSnapshot{path: path, exists: true, content: data})
	}
	return out, nil
}

func restoreClaudeDesktopSnapshots(snapshots []claudeDesktopSnapshot) error {
	for _, snap := range snapshots {
		if snap.exists {
			if err := writeFileAtomic(snap.path, snap.content, 0o600); err != nil {
				return err
			}
			continue
		}
		if err := os.Remove(snap.path); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}
