package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"

	"github.com/clovapi/switcher/internal/provider"
)

var (
	smokeCLIBinaryOnce sync.Once
	smokeCLIBinaryPath string
	smokeCLIBinaryErr  error
)

func smokeClovapiBinary(t *testing.T) string {
	t.Helper()
	smokeCLIBinaryOnce.Do(func() {
		dir, err := os.MkdirTemp("", "clovapi-smoke-build-*")
		if err != nil {
			smokeCLIBinaryErr = err
			return
		}
		out := filepath.Join(dir, "clovapi")
		if runtime.GOOS == "windows" {
			out += ".exe"
		}
		cmd := exec.Command("go", "build", "-o", out, ".")
		if wd, err := os.Getwd(); err == nil {
			cmd.Dir = wd
		}
		var stderr bytes.Buffer
		cmd.Stderr = &stderr
		if err := cmd.Run(); err != nil {
			smokeCLIBinaryErr = fmt.Errorf("go build clovapi: %w: %s", err, strings.TrimSpace(stderr.String()))
			return
		}
		smokeCLIBinaryPath = out
	})
	if smokeCLIBinaryErr != nil {
		t.Fatalf("build clovapi for smoke tests: %v", smokeCLIBinaryErr)
	}
	return smokeCLIBinaryPath
}

func smokeIsolatedEnv(t *testing.T) []string {
	t.Helper()
	root := t.TempDir()
	env := os.Environ()
	if runtime.GOOS == "windows" {
		env = append(env, "APPDATA="+root)
	} else {
		env = append(env, "XDG_CONFIG_HOME="+root)
	}
	home := filepath.Join(root, "home")
	if err := os.MkdirAll(home, 0o755); err != nil {
		t.Fatal(err)
	}
	env = append(env, "HOME="+home)
	if runtime.GOOS == "windows" {
		env = append(env, "USERPROFILE="+home)
	}
	t.Cleanup(func() {
		cmd := exec.Command(smokeClovapiBinary(t), "proxy", "stop")
		cmd.Env = env
		_ = cmd.Run()
	})
	return env
}

type smokeCLIResult struct {
	Stdout string
	Stderr string
	Code   int
}

func runSmokeCLI(t *testing.T, env []string, stdin string, args ...string) smokeCLIResult {
	t.Helper()
	cmd := exec.Command(smokeClovapiBinary(t), args...)
	cmd.Env = env
	if stdin != "" {
		cmd.Stdin = strings.NewReader(stdin)
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	code := 0
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			code = exitErr.ExitCode()
		} else {
			t.Fatalf("run clovapi %q: %v\nstderr: %s", strings.Join(args, " "), err, stderr.String())
		}
	}
	return smokeCLIResult{
		Stdout: stdout.String(),
		Stderr: stderr.String(),
		Code:   code,
	}
}

func parseSmokeJSON(t *testing.T, out string) map[string]any {
	t.Helper()
	text := strings.TrimSpace(out)
	if text == "" {
		t.Fatal("expected JSON stdout, got empty output")
	}
	var doc map[string]any
	if err := json.Unmarshal([]byte(text), &doc); err != nil {
		t.Fatalf("parse JSON %q: %v", text, err)
	}
	return doc
}

func TestCLISmokeProfilesCatalog(t *testing.T) {
	env := smokeIsolatedEnv(t)
	res := runSmokeCLI(t, env, "", "profiles", "catalog", "--json")
	if res.Code != 0 {
		t.Fatalf("profiles catalog exit=%d stderr=%q", res.Code, res.Stderr)
	}
	doc := parseSmokeJSON(t, res.Stdout)
	if doc["ok"] != true {
		t.Fatalf("catalog not ok: %+v stderr=%q", doc, res.Stderr)
	}
	providers, _ := doc["providers"].([]any)
	if len(providers) == 0 {
		t.Fatal("expected non-empty providers catalog")
	}
}

func TestCLISmokeProfilesLoadSaveRoundtrip(t *testing.T) {
	env := smokeIsolatedEnv(t)

	load := runSmokeCLI(t, env, "", "profiles", "load", "--json")
	if load.Code != 0 {
		t.Fatalf("profiles load exit=%d stderr=%q", load.Code, load.Stderr)
	}
	initial := parseSmokeJSON(t, load.Stdout)
	if initial["ok"] != true {
		t.Fatalf("load not ok: %+v", initial)
	}

	payload := map[string]any{
		"profiles": []any{
			map[string]any{
				"name":         provider.CustomAPIVendorName,
				"kind":         "api",
				"modelAdapter": "manual",
				"baseUrl":      "http://127.0.0.1:59999/v1",
				"apiKey":       "smoke-test-key",
				"models": []any{
					map[string]any{
						"id":       "smoke-model",
						"label":    "Smoke Model",
						"model":    "smoke-model",
						"apiStyle": "openai-chat",
					},
				},
			},
		},
		"proxy": map[string]any{
			"enabled": true,
			"host":    "127.0.0.1",
			"port":    27483,
		},
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}

	save := runSmokeCLI(t, env, string(raw), "profiles", "save", "--json")
	if save.Code != 0 {
		t.Fatalf("profiles save exit=%d stderr=%q stdout=%q", save.Code, save.Stderr, save.Stdout)
	}
	saved := parseSmokeJSON(t, save.Stdout)
	if saved["ok"] != true {
		t.Fatalf("save not ok: %+v stderr=%q", saved, save.Stderr)
	}

	reload := runSmokeCLI(t, env, "", "profiles", "load", "--json")
	if reload.Code != 0 {
		t.Fatalf("profiles reload exit=%d stderr=%q", reload.Code, reload.Stderr)
	}
	again := parseSmokeJSON(t, reload.Stdout)
	profiles, _ := again["profiles"].([]any)
	if len(profiles) == 0 {
		t.Fatalf("profiles not persisted: %+v", again)
	}
}

func TestCLISmokeAuthAndProxyStatusJSON(t *testing.T) {
	env := smokeIsolatedEnv(t)

	auth := runSmokeCLI(t, env, "", "auth", "status", "--json")
	if auth.Code != 0 {
		t.Fatalf("auth status exit=%d stderr=%q", auth.Code, auth.Stderr)
	}
	authDoc := parseSmokeJSON(t, auth.Stdout)
	if authDoc["ok"] != true {
		t.Fatalf("auth status not ok: %+v", authDoc)
	}

	proxy := runSmokeCLI(t, env, "", "proxy", "status", "--json")
	if proxy.Code != 0 {
		t.Fatalf("proxy status exit=%d stderr=%q", proxy.Code, proxy.Stderr)
	}
	proxyDoc := parseSmokeJSON(t, proxy.Stdout)
	if _, ok := proxyDoc["running"]; !ok {
		t.Fatalf("proxy status missing running field: %+v", proxyDoc)
	}
}
