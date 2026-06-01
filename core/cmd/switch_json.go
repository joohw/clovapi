package main

import (
	"bufio"
	"io"
	"os"
	"strings"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/profile"
)

func runSwitchJSON(
	sc *bufio.Scanner,
	s *profile.Store,
	kind agentkind.Kind,
	resetFlag bool,
	bindingFlag, providerFlag, vendorFlag, modelFlag, directBaseURL, directAPIKey, directModel, directAPIStyle, positional string,
) error {
	out := map[string]any{
		"cli": string(kind),
	}
	var err error
	if quietErr := withQuietStdout(func() error {
		err = runSwitch(sc, s, kind, resetFlag, bindingFlag, providerFlag, vendorFlag, modelFlag, directBaseURL, directAPIKey, directModel, directAPIStyle, positional)
		return err
	}); quietErr != nil {
		return quietErr
	}
	if err != nil {
		out["ok"] = false
		out["error"] = err.Error()
		return writeDesktopJSON(out)
	}
	out["ok"] = true
	if resetFlag {
		out["reset"] = true
	}
	if p := strings.TrimSpace(providerFlag); p != "" {
		out["providerId"] = p
	}
	if m := strings.TrimSpace(modelFlag); m != "" {
		out["modelId"] = m
	}
	return writeDesktopJSON(out)
}

func withQuietStdout(fn func() error) error {
	old := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		return fn()
	}
	os.Stdout = w
	runErr := fn()
	w.Close()
	os.Stdout = old
	_, _ = io.Copy(io.Discard, r)
	_ = r.Close()
	return runErr
}
