//go:build live

package smoke_test

import (
	"bytes"
	"context"
	"fmt"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/apply"
	cfgpkg "github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
	"github.com/clovapi/switcher/internal/proxy"
	"github.com/clovapi/switcher/internal/testclient"
)

const (
	smokeAPIKey        = "clovapi-local"
	smokePrompt        = "Use an available tool to get the current local time, then reply with only that time."
	smokeCLITimeout    = 3 * time.Minute
	claudeDefaultModel = "claude-sonnet-4-6"
	codexDefaultModel  = "gpt-5.4"
)

type smokeProvider struct {
	id      string
	name    string
	modelID string
	profile profile.Profile
}

type smokeResult struct {
	Agent    agentkind.Kind
	Provider string
	Style    apistyle.Style
	Phase    string
	Status   string
	Detail   string
}

func TestLiveAgentProxySmoke(t *testing.T) {
	testLiveAgentProxySmoke(t, smokeRequireAllAgentsInstalled(t))
}

func TestLiveOpenClawHermesProxySmoke(t *testing.T) {
	testLiveAgentProxySmoke(t, smokeRequireAgentsInstalled(t, []agentkind.Kind{
		agentkind.OpenClaw,
		agentkind.Hermes,
	}))
}

func testLiveAgentProxySmoke(t *testing.T, kinds []agentkind.Kind) {
	providers := smokeLoadSubscriptions(t)
	home := smokeIsolatedHome(t)
	store := smokeStore(providers)
	baseURL, callLogs := smokeProxyBaseURL(t, store)

	var results []smokeResult
	record := func(r smokeResult) {
		results = append(results, r)
	}
	styles := []apistyle.Style{apistyle.Claude, apistyle.OpenAIResponses}

	t.Run("proxy-endpoints", func(t *testing.T) {
		for _, sp := range providers {
			for _, style := range styles {
				cell := fmt.Sprintf("%s/%s", sp.id, style)
				t.Run(cell, func(t *testing.T) {
					proxyBase := smokeIngressBaseURL(baseURL, sp.id, sp.modelID, style)
					if err := testclient.Probe(style, proxyBase, smokeAPIKey, sp.modelID); err != nil {
						record(smokeResult{Provider: sp.id, Style: style, Phase: "proxy", Status: "failed", Detail: err.Error()})
						t.Errorf("proxy ping failed: %v", err)
						return
					}
					record(smokeResult{Provider: sp.id, Style: style, Phase: "proxy", Status: "passed"})
				})
			}
		}
	})
	if smokePhaseFailed(results, "proxy") {
		smokeLogSummary(t, results)
		t.Fatalf("proxy endpoint stage failed; skipping real agent stage")
	}

	for _, kind := range kinds {
		for _, sp := range providers {
			for _, style := range styles {
				cell := fmt.Sprintf("%s/%s/%s", kind, sp.id, style)
				t.Run("agents/"+cell, func(t *testing.T) {
					proxyBase := smokeIngressBaseURL(baseURL, sp.id, sp.modelID, style)
					if !apply.KindSupportsStyle(kind, style) {
						record(smokeResult{Agent: kind, Provider: sp.id, Style: style, Phase: "cli", Status: "unsupported", Detail: "agent does not emit this ingress style"})
						return
					}
					before := len(smokeCallLogs(callLogs))
					p := profile.Profile{
						Name:                   "smoke",
						Kind:                   "subscription",
						SubscriptionProviderID: sp.id,
						CLI:                    kind,
						APIStyle:               style,
						BaseURL:                proxyBase,
						APIKey:                 smokeAPIKey,
						Model:                  sp.modelID,
					}
					if err := apply.Apply(p); err != nil {
						record(smokeResult{Agent: kind, Provider: sp.id, Style: style, Phase: "cli", Status: "failed", Detail: "apply: " + err.Error()})
						t.Errorf("apply failed: %v", err)
						return
					}
					out, err := smokeRunAgentCLI(t.Context(), kind, home, sp.modelID)
					if err != nil {
						record(smokeResult{Agent: kind, Provider: sp.id, Style: style, Phase: "cli", Status: "failed", Detail: fmt.Sprintf("%v: %s", err, truncate(out, 800))})
						t.Errorf("agent CLI failed: %v\n%s", err, truncate(out, 1200))
						return
					}
					if !smokeSawNewSuccessfulCall(callLogs, before, sp.id, sp.modelID, style) {
						detail := "agent exited successfully but no successful proxy call was recorded"
						record(smokeResult{Agent: kind, Provider: sp.id, Style: style, Phase: "cli", Status: "failed", Detail: detail + ": " + truncate(out, 400)})
						t.Error(detail)
						return
					}
					record(smokeResult{Agent: kind, Provider: sp.id, Style: style, Phase: "cli", Status: "passed", Detail: truncate(out, 200)})
				})
			}
		}
	}
	smokeLogSummary(t, results)
	if smokeFailed(results) {
		t.Fatalf("live smoke failures found; see per-cell errors and summary above")
	}
}

func smokeLoadSubscriptions(t *testing.T) []smokeProvider {
	t.Helper()
	claudeModel := strings.TrimSpace(os.Getenv("CLOVAPI_CLAUDE_MODEL"))
	if claudeModel == "" {
		claudeModel = claudeDefaultModel
	}
	codexModel := strings.TrimSpace(os.Getenv("CLOVAPI_CODEX_MODEL"))
	if codexModel == "" {
		codexModel = codexDefaultModel
	}

	claude := profile.Profile{
		Name:                   provider.ClaudeCodeVendorName,
		Kind:                   "subscription",
		SubscriptionProviderID: provider.ClaudeCodeProviderID,
		ModelAdapter:           "subscription",
		APIStyle:               apistyle.Claude,
		Model:                  claudeModel,
		Models: []profile.Model{{
			ID:       claudeModel,
			Label:    claudeModel,
			Model:    claudeModel,
			APIStyle: apistyle.Claude,
		}},
	}
	profile.HydrateSubscriptionCredentials(&claude)
	if strings.TrimSpace(claude.BaseURL) == "" || strings.TrimSpace(claude.APIKey) == "" {
		t.Skip("Claude Code subscription credentials not found")
	}

	codex := profile.Profile{
		Name:                   provider.CodexVendorName,
		Kind:                   "subscription",
		SubscriptionProviderID: provider.CodexProviderID,
		ModelAdapter:           "subscription",
		APIStyle:               apistyle.OpenAIResponses,
		Model:                  codexModel,
		Models: []profile.Model{{
			ID:       codexModel,
			Label:    codexModel,
			Model:    codexModel,
			APIStyle: apistyle.OpenAIResponses,
		}},
	}
	profile.HydrateSubscriptionCredentials(&codex)
	if strings.TrimSpace(codex.BaseURL) == "" || strings.TrimSpace(codex.APIKey) == "" {
		t.Skip("Codex subscription credentials not found")
	}
	if strings.TrimSpace(codex.AccountID) == "" {
		t.Skip("Codex subscription account_id not found")
	}

	return []smokeProvider{
		{id: provider.ClaudeCodeProviderID, name: provider.ClaudeCodeVendorName, modelID: claudeModel, profile: claude},
		{id: provider.CodexProviderID, name: provider.CodexVendorName, modelID: codexModel, profile: codex},
	}
}

func smokeRequireAllAgentsInstalled(t *testing.T) []agentkind.Kind {
	t.Helper()
	kinds := apply.RegisteredKinds()
	return smokeRequireAgentsInstalled(t, kinds)
}

func smokeRequireAgentsInstalled(t *testing.T, kinds []agentkind.Kind) []agentkind.Kind {
	t.Helper()
	var missing []string
	for _, kind := range kinds {
		target, ok := apply.TargetFor(kind)
		if !ok || target == nil || !target.Installed() {
			missing = append(missing, string(kind))
		}
	}
	if len(missing) > 0 {
		t.Skipf("not all agent CLIs are installed; missing: %s", strings.Join(missing, ", "))
	}
	return kinds
}

func smokeIsolatedHome(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	configDir := filepath.Join(home, ".config", "clovapi")
	cfgpkg.SetDirOverride(configDir)
	t.Cleanup(func() { cfgpkg.SetDirOverride("") })
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	t.Setenv("CLOVAPI_SWITCHER_OPENCODE_DIR", filepath.Join(home, ".config", "opencode"))
	t.Setenv("OPENCLAW_CONFIG_PATH", filepath.Join(home, ".openclaw", "openclaw.json"))
	t.Setenv("HERMES_HOME", filepath.Join(home, ".hermes"))
	t.Setenv("CODEX_HOME", filepath.Join(home, ".codex"))
	for _, dir := range []string{
		filepath.Join(home, ".claude"),
		filepath.Join(home, ".codex"),
		filepath.Join(home, ".config", "opencode"),
		filepath.Join(home, ".openclaw"),
		filepath.Join(home, ".hermes"),
		filepath.Join(home, ".kimi"),
	} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatalf("create isolated config dir %s: %v", dir, err)
		}
	}
	smokeSeedHermes(t, filepath.Join(home, ".hermes"))
	return home
}

func smokeSeedHermes(t *testing.T, hermesHome string) {
	t.Helper()
	cfg := `agent:
  max_turns: 1
approvals:
  mode: auto
hooks:
  auto_accept: true
`
	if err := os.WriteFile(filepath.Join(hermesHome, "config.yaml"), []byte(cfg), 0o600); err != nil {
		t.Fatalf("seed Hermes config: %v", err)
	}
}

func smokeStore(providers []smokeProvider) *profile.Store {
	store := &profile.Store{
		Version: profile.StoreVersion,
		Active:  map[string]profile.ActiveSelection{},
		Proxy:   profile.ProxyConfig{Enabled: true, Host: "127.0.0.1", Port: 27483},
	}
	for _, sp := range providers {
		store.List = append(store.List, sp.profile)
	}
	return store
}

func smokeProxyBaseURL(t *testing.T, store *profile.Store) (string, *proxy.CallLogStore) {
	t.Helper()
	logs := proxy.NewCallLogStoreInDir(t.TempDir())
	t.Cleanup(func() { _ = logs.Close() })
	srv := proxy.NewServer(profile.ProxyConfig{Enabled: true, Host: "127.0.0.1", Port: 27483})
	srv.CallLogs = logs
	srv.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	ts := httptest.NewServer(srv.Server.Handler)
	t.Cleanup(ts.Close)
	return strings.TrimRight(ts.URL, "/"), logs
}

func smokeIngressBaseURL(baseURL, providerID, modelID string, style apistyle.Style) string {
	return fmt.Sprintf("%s/%s/%s/%s/v1", strings.TrimRight(baseURL, "/"), providerID, modelID, style)
}

func smokeCallLogs(store *proxy.CallLogStore) []proxy.CallLogEntry {
	return store.ListRecent(200)
}

func smokeSawNewSuccessfulCall(store *proxy.CallLogStore, before int, providerID, modelID string, style apistyle.Style) bool {
	entries := smokeCallLogs(store)
	if len(entries) <= before {
		return false
	}
	pathNeedle := fmt.Sprintf("/%s/%s/%s/v1/", providerID, modelID, style)
	for _, entry := range entries[:len(entries)-before] {
		if strings.Contains(entry.Request.URL, pathNeedle) && entry.Upstream.Status >= 200 && entry.Upstream.Status < 300 && strings.TrimSpace(entry.Error) == "" {
			return true
		}
	}
	return false
}

func smokeRunAgentCLI(ctx context.Context, kind agentkind.Kind, home string, modelID string) (string, error) {
	modelRef := "clovapi/" + profileModelSegment(modelID)
	switch kind {
	case agentkind.ClaudeCode:
		return runFirstSuccessful(ctx, kind, home, [][]string{
			{"claude", "-p", "--dangerously-skip-permissions", "--permission-mode", "bypassPermissions", smokePrompt},
			{"claude", "--print", "--dangerously-skip-permissions", smokePrompt},
		})
	case agentkind.Codex:
		return runFirstSuccessful(ctx, kind, home, [][]string{
			{"codex", "exec", "--skip-git-repo-check", "--ignore-rules", "--dangerously-bypass-approvals-and-sandbox", "--json", smokePrompt},
			{"codex", "exec", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox", smokePrompt},
		})
	case agentkind.OpenCode:
		return runFirstSuccessful(ctx, kind, home, [][]string{
			{"opencode", "run", "--model", modelRef, "--format", "json", "--dangerously-skip-permissions", smokePrompt},
			{"opencode", "run", "--model", modelRef, "--dangerously-skip-permissions", smokePrompt},
		})
	case agentkind.OpenClaw:
		return runFirstSuccessful(ctx, kind, home, [][]string{
			{"openclaw", "agent", "--local", "--session-key", "agent:smoke:live", "--message", smokePrompt, "--model", modelRef, "--timeout", "180", "--json"},
			{"openclaw", "agent", "--local", "--session-key", "agent:smoke:live", "--message", smokePrompt, "--model", modelRef, "--timeout", "180"},
		})
	case agentkind.Hermes:
		return runFirstSuccessful(ctx, kind, home, [][]string{
			{"hermes", "chat", "-q", smokePrompt, "-Q", "--accept-hooks", "--yolo", "--max-turns", "1", "--ignore-rules"},
		})
	case agentkind.KimiCode:
		return runFirstSuccessful(ctx, kind, home, [][]string{
			{"kimi", "--print", "--yolo", "--afk", "--prompt", smokePrompt},
			{"kimi", "--quiet", "--yolo", "--afk", "--prompt", smokePrompt},
		})
	default:
		return "", fmt.Errorf("no smoke runner for %s", kind)
	}
}

func profileModelSegment(modelID string) string {
	parts := strings.Split(strings.Trim(strings.TrimSpace(modelID), "/"), "/")
	if len(parts) == 0 {
		return strings.TrimSpace(modelID)
	}
	return strings.TrimSpace(parts[len(parts)-1])
}

func runFirstSuccessful(parent context.Context, kind agentkind.Kind, home string, candidates [][]string) (string, error) {
	var failures []string
	for _, argv := range candidates {
		out, err := runCommand(parent, home, argv)
		if err == nil {
			return out, nil
		}
		failures = append(failures, fmt.Sprintf("%s: %v: %s", strings.Join(argv, " "), err, truncate(out, 300)))
	}
	return strings.Join(failures, "\n"), fmt.Errorf("%s CLI smoke candidates failed", kind)
}

func runCommand(parent context.Context, home string, argv []string) (string, error) {
	ctx, cancel := context.WithTimeout(parent, smokeCLITimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, argv[0], argv[1:]...)
	cmd.Dir = home
	cmd.Env = append(os.Environ(),
		"HOME="+home,
		"USERPROFILE="+home,
		"XDG_CONFIG_HOME="+filepath.Join(home, ".config"),
		"CLOVAPI_SWITCHER_OPENCODE_DIR="+filepath.Join(home, ".config", "opencode"),
		"OPENCLAW_CONFIG_PATH="+filepath.Join(home, ".openclaw", "openclaw.json"),
		"HERMES_HOME="+filepath.Join(home, ".hermes"),
		"CODEX_HOME="+filepath.Join(home, ".codex"),
	)
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	err := cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		return buf.String(), ctx.Err()
	}
	return buf.String(), err
}

func smokeFailed(results []smokeResult) bool {
	for _, r := range results {
		if r.Status == "failed" {
			return true
		}
	}
	return false
}

func smokePhaseFailed(results []smokeResult, phase string) bool {
	for _, r := range results {
		if r.Phase == phase && r.Status == "failed" {
			return true
		}
	}
	return false
}

func smokeLogSummary(t *testing.T, results []smokeResult) {
	t.Helper()
	counts := map[string]int{}
	for _, r := range results {
		counts[r.Status]++
	}
	t.Logf("live smoke summary: passed=%d failed=%d unsupported=%d skipped=%d total=%d",
		counts["passed"], counts["failed"], counts["unsupported"], counts["skipped"], len(results))
	var failed []smokeResult
	for _, r := range results {
		if r.Status == "failed" {
			failed = append(failed, r)
		}
	}
	sort.Slice(failed, func(i, j int) bool {
		a := fmt.Sprintf("%s/%s/%s/%s", failed[i].Agent, failed[i].Provider, failed[i].Style, failed[i].Phase)
		b := fmt.Sprintf("%s/%s/%s/%s", failed[j].Agent, failed[j].Provider, failed[j].Style, failed[j].Phase)
		return a < b
	})
	for _, r := range failed {
		agent := string(r.Agent)
		if agent == "" {
			agent = "-"
		}
		t.Logf("FAILED %s/%s/%s phase=%s: %s", agent, r.Provider, r.Style, r.Phase, truncate(r.Detail, 600))
	}
}

func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
