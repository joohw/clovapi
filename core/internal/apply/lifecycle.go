package apply

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/clovapi/switcher/internal/agentkind"
)

// AgentInstaller is an optional capability implemented by targets that know how
// to install their agent CLI.
type AgentInstaller interface {
	Install() error
}

// AgentUninstaller is an optional capability implemented by targets that know
// how to uninstall their agent CLI.
type AgentUninstaller interface {
	Uninstall() error
}

// AgentInstallPlanner is an optional capability implemented by targets that can
// explain what automatic install will do before the user confirms it.
type AgentInstallPlanner interface {
	InstallPlan() string
}

// AgentStopper is an optional best-effort pre-uninstall process stopper.
type AgentStopper interface {
	Stop() error
}

// SupportsInstall reports whether the registered target implements Install.
func SupportsInstall(k agentkind.Kind) bool {
	t, ok := TargetFor(k)
	if !ok || t == nil {
		return false
	}
	_, ok = t.(AgentInstaller)
	return ok
}

// SupportsUninstall reports whether the registered target implements Uninstall.
func SupportsUninstall(k agentkind.Kind) bool {
	t, ok := TargetFor(k)
	if !ok || t == nil {
		return false
	}
	_, ok = t.(AgentUninstaller)
	return ok
}

// InstallPlan returns a user-facing description of the target's install source.
func InstallPlan(k agentkind.Kind) string {
	t, ok := TargetFor(k)
	if !ok || t == nil {
		return ""
	}
	planner, ok := t.(AgentInstallPlanner)
	if !ok {
		return ""
	}
	return strings.TrimSpace(planner.InstallPlan())
}

// InstallAgent invokes the target's optional installer.
func InstallAgent(k agentkind.Kind) error {
	t, ok := TargetFor(k)
	if !ok || t == nil {
		return fmt.Errorf("unsupported cli %q", k)
	}
	installer, ok := t.(AgentInstaller)
	if !ok {
		return fmt.Errorf("cli %q does not support automatic install", k)
	}
	return installer.Install()
}

// UninstallAgent invokes the target's optional uninstaller.
func UninstallAgent(k agentkind.Kind) error {
	t, ok := TargetFor(k)
	if !ok || t == nil {
		return fmt.Errorf("unsupported cli %q", k)
	}
	uninstaller, ok := t.(AgentUninstaller)
	if !ok {
		return fmt.Errorf("cli %q does not support automatic uninstall", k)
	}
	if stopper, ok := t.(AgentStopper); ok {
		_ = stopper.Stop()
	}
	return uninstaller.Uninstall()
}

type installCandidate struct {
	Manager string
	Label   string
	Args    []string
	OS      string
}

type uninstallCandidate struct {
	Manager string
	Label   string
	Args    []string
	OS      string
	Files   []string
}

func npmGlobalInstall(pkg string) error {
	return installFromCandidates(npmGlobalInstallCandidate(pkg))
}

func npmGlobalInstallCandidate(pkg string) installCandidate {
	return installCandidate{Manager: "npm", Label: "npm:" + pkg, Args: []string{"install", "-g", pkg}}
}

func pythonPipInstall(pkg string) installCandidate {
	return installCandidate{Manager: "python", Label: "pip:" + pkg, Args: []string{"-m", "pip", "install", pkg}}
}

func npmGlobalPrefix() (string, bool) {
	path, err := resolveExecutable("npm")
	if err != nil {
		return "", false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, path, "config", "get", "prefix")
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	if err := cmd.Run(); err != nil {
		return "", false
	}
	prefix := strings.TrimSpace(out.String())
	return prefix, prefix != ""
}

func npmGlobalUninstall(pkg string) uninstallCandidate {
	return uninstallCandidate{Manager: "npm", Label: "npm:" + pkg, Args: []string{"uninstall", "-g", pkg}}
}

func brewUninstall(pkg string) uninstallCandidate {
	return uninstallCandidate{Manager: "brew", Label: "brew:" + pkg, Args: []string{"uninstall", pkg}}
}

func pythonPipUninstall(pkg string) uninstallCandidate {
	return uninstallCandidate{Manager: "python", Label: "pip:" + pkg, Args: []string{"-m", "pip", "uninstall", "-y", pkg}}
}

func wingetUninstall(id string) uninstallCandidate {
	return uninstallCandidate{
		Manager: "winget",
		Label:   "winget:" + id,
		OS:      "windows",
		Args: []string{
			"uninstall", "--id", id, "--silent", "--accept-source-agreements", "--disable-interactivity",
		},
	}
}

func standaloneUninstall(label string, files ...string) uninstallCandidate {
	return uninstallCandidate{Manager: "standalone", Label: "standalone:" + label, Files: files}
}

func homeLocalBinFiles(command string) []string {
	home, _ := os.UserHomeDir()
	if strings.TrimSpace(home) == "" {
		return nil
	}
	return commandShimFiles(filepath.Join(home, ".local", "bin"), command)
}

func npmGlobalShimFiles(command string) []string {
	if prefix, ok := npmGlobalPrefix(); ok {
		return commandShimFiles(prefix, command)
	}
	return nil
}

func opencodeStandaloneFiles() []string {
	home, _ := os.UserHomeDir()
	if strings.TrimSpace(home) == "" {
		return nil
	}
	return commandShimFiles(filepath.Join(home, ".opencode", "bin"), "opencode")
}

func commandShimFiles(dir, command string) []string {
	dir = strings.TrimSpace(dir)
	command = strings.TrimSpace(command)
	if dir == "" || command == "" {
		return nil
	}
	if runtime.GOOS == "windows" {
		return []string{
			filepath.Join(dir, command),
			filepath.Join(dir, command+".exe"),
			filepath.Join(dir, command+".cmd"),
			filepath.Join(dir, command+".ps1"),
			filepath.Join(dir, command+".bat"),
		}
	}
	return []string{filepath.Join(dir, command)}
}

func stopAgentProcesses(names, commandLineHints []string) error {
	if runtime.GOOS == "windows" {
		return stopAgentProcessesWindows(names, commandLineHints)
	}
	return stopAgentProcessesUnix(names, commandLineHints)
}

func stopAgentProcessesWindows(names, commandLineHints []string) error {
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if !strings.HasSuffix(strings.ToLower(name), ".exe") {
			name += ".exe"
		}
		_ = exec.Command("taskkill", "/IM", name, "/T", "/F").Run()
	}
	if len(commandLineHints) == 0 {
		return nil
	}
	script := buildPowerShellStopByCommandLineScript(commandLineHints)
	if strings.TrimSpace(script) == "" {
		return nil
	}
	_ = exec.Command("powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script).Run()
	return nil
}

func stopAgentProcessesUnix(names, commandLineHints []string) error {
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		_ = exec.Command("pkill", "-x", name).Run()
	}
	for _, hint := range commandLineHints {
		hint = strings.TrimSpace(hint)
		if hint == "" {
			continue
		}
		_ = exec.Command("pkill", "-f", hint).Run()
	}
	return nil
}

func buildPowerShellStopByCommandLineScript(hints []string) string {
	var quoted []string
	for _, hint := range hints {
		hint = strings.TrimSpace(hint)
		if hint == "" {
			continue
		}
		quoted = append(quoted, "'"+strings.ReplaceAll(hint, "'", "''")+"'")
	}
	if len(quoted) == 0 {
		return ""
	}
	return "$hints = @(" + strings.Join(quoted, ",") + "); " +
		"Get-CimInstance Win32_Process | Where-Object { " +
		"$cmd = $_.CommandLine; if (-not $cmd) { return $false }; " +
		"foreach ($hint in $hints) { if ($cmd -like ('*' + $hint + '*')) { return $true } }; return $false " +
		"} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
}

func installFromCandidates(candidates ...installCandidate) error {
	var attempted []string
	var failures []string
	managerSeen := map[string]bool{}
	managerAvailable := map[string]bool{}

	for _, candidate := range candidates {
		if candidate.OS != "" && candidate.OS != runtime.GOOS {
			continue
		}
		managerSeen[candidate.Manager] = true
		if _, ok := managerAvailable[candidate.Manager]; !ok {
			managerAvailable[candidate.Manager] = ensurePackageManagerAvailable(candidate.Manager)
		}
		if !managerAvailable[candidate.Manager] {
			continue
		}
		attempted = append(attempted, candidate.Label)
		if err := runPackageManager(candidate.Manager, candidate.Args...); err != nil {
			failures = append(failures, fmt.Sprintf("%s: %v", candidate.Label, err))
			continue
		}
		return nil
	}

	if len(attempted) == 0 {
		return fmt.Errorf("no supported installer found (needed one of: %s). Install the required runtime/package manager, then try again", joinCandidateManagers(managerSeen))
	}
	return fmt.Errorf("automatic install failed; attempted %s; %s", strings.Join(attempted, ", "), strings.Join(failures, "; "))
}

func uninstallFromCandidates(candidates ...uninstallCandidate) error {
	var attempted []string
	var failures []string
	succeeded := false
	managerSeen := map[string]bool{}
	managerAvailable := map[string]bool{}

	for _, candidate := range candidates {
		if candidate.OS != "" && candidate.OS != runtime.GOOS {
			continue
		}
		managerSeen[candidate.Manager] = true
		if candidate.Manager == "standalone" {
			attempted = append(attempted, candidate.Label)
			if err := removeStandaloneFiles(candidate.Files); err != nil {
				failures = append(failures, fmt.Sprintf("%s: %v", candidate.Label, err))
				continue
			}
			succeeded = true
			continue
		}
		if _, ok := managerAvailable[candidate.Manager]; !ok {
			managerAvailable[candidate.Manager] = commandAvailable(candidate.Manager)
		}
		if !managerAvailable[candidate.Manager] {
			continue
		}
		attempted = append(attempted, candidate.Label)
		if err := runPackageManager(candidate.Manager, candidate.Args...); err != nil {
			failures = append(failures, fmt.Sprintf("%s: %v", candidate.Label, err))
			continue
		}
		succeeded = true
	}

	if succeeded {
		return nil
	}
	if len(attempted) == 0 {
		return fmt.Errorf("no supported package manager found (needed one of: %s)", joinCandidateManagers(managerSeen))
	}
	return fmt.Errorf("automatic uninstall failed; attempted %s; %s", strings.Join(attempted, ", "), strings.Join(failures, "; "))
}

func removeStandaloneFiles(files []string) error {
	var removed []string
	var failures []string
	for _, file := range files {
		file = strings.TrimSpace(file)
		if file == "" {
			continue
		}
		cleaned, err := filepath.Abs(filepath.Clean(file))
		if err != nil {
			failures = append(failures, fmt.Sprintf("%s: %v", file, err))
			continue
		}
		if !safeStandaloneCLIPath(cleaned) {
			failures = append(failures, fmt.Sprintf("%s: outside supported CLI install dirs", cleaned))
			continue
		}
		info, err := os.Stat(cleaned)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			failures = append(failures, fmt.Sprintf("%s: %v", cleaned, err))
			continue
		}
		if info.IsDir() {
			failures = append(failures, fmt.Sprintf("%s: refusing to remove directory", cleaned))
			continue
		}
		if err := os.Remove(cleaned); err != nil {
			failures = append(failures, fmt.Sprintf("%s: %v", cleaned, err))
			continue
		}
		removed = append(removed, cleaned)
	}
	if len(removed) > 0 {
		return nil
	}
	if len(failures) > 0 {
		return fmt.Errorf("%s", strings.Join(failures, "; "))
	}
	return fmt.Errorf("no standalone CLI files found")
}

func safeStandaloneCLIPath(path string) bool {
	home, _ := os.UserHomeDir()
	var roots []string
	if strings.TrimSpace(home) != "" {
		roots = append(roots, filepath.Join(home, ".local", "bin"))
	}
	if prefix, ok := npmGlobalPrefix(); ok {
		roots = append(roots, prefix)
	}
	for _, root := range roots {
		if pathWithinDir(path, root) {
			return true
		}
	}
	return false
}

func pathWithinDir(path, root string) bool {
	pathAbs, err := filepath.Abs(filepath.Clean(path))
	if err != nil {
		return false
	}
	rootAbs, err := filepath.Abs(filepath.Clean(root))
	if err != nil {
		return false
	}
	rel, err := filepath.Rel(rootAbs, pathAbs)
	if err != nil || rel == "." {
		return false
	}
	return rel != "" && !strings.HasPrefix(rel, "..") && !filepath.IsAbs(rel)
}

func commandAvailable(name string) bool {
	_, err := resolveExecutable(name)
	return err == nil
}

func regularFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func ensurePackageManagerAvailable(name string) bool {
	if commandAvailable(name) {
		return true
	}
	switch name {
	case "npm":
		return installNodeRuntimeForNPM()
	case "python":
		return installPythonRuntimeForPip()
	default:
		return false
	}
}

func installNodeRuntimeForNPM() bool {
	switch runtime.GOOS {
	case "windows":
		if !commandAvailable("winget") {
			return false
		}
		_ = runPackageManager("winget", "install", "--id", "OpenJS.NodeJS.LTS", "--silent", "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity")
		return commandAvailable("npm")
	case "darwin":
		if !commandAvailable("brew") {
			return false
		}
		_ = runPackageManager("brew", "install", "node")
		return commandAvailable("npm")
	default:
		if commandAvailable("brew") {
			_ = runPackageManager("brew", "install", "node")
			return commandAvailable("npm")
		}
		return false
	}
}

func installPythonRuntimeForPip() bool {
	switch runtime.GOOS {
	case "windows":
		if !commandAvailable("winget") {
			return false
		}
		_ = runPackageManager("winget", "install", "--id", "Python.Python.3.12", "--silent", "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity")
		return commandAvailable("python")
	case "darwin":
		if !commandAvailable("brew") {
			return false
		}
		_ = runPackageManager("brew", "install", "python")
		return commandAvailable("python")
	default:
		if commandAvailable("brew") {
			_ = runPackageManager("brew", "install", "python")
			return commandAvailable("python")
		}
		return false
	}
}

func joinCandidateManagers(seen map[string]bool) string {
	var out []string
	for _, name := range []string{"npm", "brew", "winget", "python", "standalone"} {
		if seen[name] {
			out = append(out, name)
		}
	}
	if len(out) == 0 {
		return "none"
	}
	return strings.Join(out, ", ")
}

func runPackageManager(name string, args ...string) error {
	path, err := resolveExecutable(name)
	if err != nil {
		return fmt.Errorf("%s is required but was not found on PATH", name)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, path, args...)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(out.String())
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("%s %s timed out", name, strings.Join(args, " "))
		}
		if msg != "" {
			return fmt.Errorf("%s %s failed: %w: %s", name, strings.Join(args, " "), err, msg)
		}
		return fmt.Errorf("%s %s failed: %w", name, strings.Join(args, " "), err)
	}
	return nil
}

func resolveExecutable(name string) (string, error) {
	exe := name
	if runtime.GOOS == "windows" && !strings.HasSuffix(strings.ToLower(name), ".cmd") {
		exe = name + ".cmd"
	}
	path, err := exec.LookPath(exe)
	if err != nil && runtime.GOOS == "windows" {
		path, err = exec.LookPath(name)
	}
	if err == nil {
		return path, nil
	}
	if p, searchErr := resolveExecutableBySearch(name); searchErr == nil {
		return p, nil
	}
	if runtime.GOOS == "windows" && strings.EqualFold(name, "npm") {
		for _, candidate := range windowsNPMCandidates() {
			if regularFile(candidate) {
				return candidate, nil
			}
		}
	}
	if runtime.GOOS == "windows" && strings.EqualFold(name, "python") {
		if py, pyErr := exec.LookPath("py.exe"); pyErr == nil {
			return py, nil
		}
		for _, candidate := range windowsPythonCandidates() {
			if regularFile(candidate) {
				return candidate, nil
			}
		}
	}
	return path, err
}

func windowsNPMCandidates() []string {
	var out []string
	for _, env := range []string{"ProgramFiles", "ProgramFiles(x86)"} {
		if root := strings.TrimSpace(os.Getenv(env)); root != "" {
			out = append(out, filepath.Join(root, "nodejs", "npm.cmd"))
		}
	}
	return out
}

func windowsPythonCandidates() []string {
	var out []string
	for _, env := range []string{"LocalAppData", "ProgramFiles", "ProgramFiles(x86)"} {
		root := strings.TrimSpace(os.Getenv(env))
		if root == "" {
			continue
		}
		matches, _ := filepath.Glob(filepath.Join(root, "Programs", "Python", "Python*", "python.exe"))
		out = append(out, matches...)
	}
	return out
}
