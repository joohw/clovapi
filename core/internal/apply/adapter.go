package apply

import (
	"fmt"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/syslog"
)

// ProfileTarget writes one profile to on-disk config for a specific local CLI / agent.
type ProfileTarget interface {
	Kind() clikind.Kind
	SupportedStyles() []apistyle.Style
	Description() string
	Apply(p profile.Profile) error
	// ResetDefault removes clovapi-injected settings from that tool’s config (best-effort; no-op if file missing).
	ResetDefault() error
	// Installed reports whether this CLI appears present on the local machine (e.g. binary on PATH).
	Installed() bool
}

var targets = map[clikind.Kind]ProfileTarget{}

// Register adds or replaces a target for its Kind(). Must be called from init() only.
func Register(t ProfileTarget) {
	if t == nil {
		panic("apply.Register: nil ProfileTarget")
	}
	k := t.Kind()
	if k == "" {
		panic("apply.Register: empty Kind")
	}
	targets[k] = t
}

// TargetFor returns the registered ProfileTarget for k.
func TargetFor(k clikind.Kind) (ProfileTarget, bool) {
	t, ok := targets[k]
	return t, ok
}

// RegisteredKinds returns CLI kinds in stable UI order (must match all Register calls).
func RegisteredKinds() []clikind.Kind {
	return []clikind.Kind{
		clikind.ClaudeCode,
		clikind.Codex,
		clikind.OpenCode,
		clikind.OpenClaw,
		clikind.Hermes,
		clikind.KimiCode,
	}
}

// PartitionKindsByInstall splits registered kinds into detected-installed vs not, preserving order within each group.
func PartitionKindsByInstall() (installed, notInstalled []clikind.Kind) {
	for _, k := range RegisteredKinds() {
		t, ok := TargetFor(k)
		if !ok || t == nil {
			continue
		}
		if t.Installed() {
			installed = append(installed, k)
		} else {
			notInstalled = append(notInstalled, k)
		}
	}
	return installed, notInstalled
}

// SupportedStyles returns API styles supported by k (from registry).
func SupportedStyles(k clikind.Kind) []apistyle.Style {
	t, ok := TargetFor(k)
	if !ok || t == nil {
		return nil
	}
	return t.SupportedStyles()
}

// KindSupportsStyle reports whether k accepts API style s when applying a profile.
func KindSupportsStyle(k clikind.Kind, s apistyle.Style) bool {
	for _, x := range SupportedStyles(k) {
		if x == s {
			return true
		}
	}
	return false
}

// Apply resolves the profile's CLI kind to a registered ProfileTarget and applies it.
func Apply(p profile.Profile) error {
	t, ok := TargetFor(p.CLI)
	if !ok {
		return fmt.Errorf("unsupported cli %q", p.CLI)
	}
	if !KindSupportsStyle(p.CLI, p.APIStyle) {
		var allowed []string
		for _, x := range SupportedStyles(p.CLI) {
			allowed = append(allowed, string(x))
		}
		return fmt.Errorf("cli %q does not support api style %q (allowed: %s)", p.CLI, p.APIStyle, joinComma(allowed))
	}
	if err := t.Apply(p); err != nil {
		syslog.LogCLIApplyFailed(p.CLI, err)
		return err
	}
	syslog.LogCLIApplied(p.CLI, p.Model, p.APIStyle)
	return nil
}

// ResetDefault runs the registered target’s ResetDefault (clears relay bindings written by Apply).
func ResetDefault(k clikind.Kind) error {
	t, ok := TargetFor(k)
	if !ok || t == nil {
		return fmt.Errorf("unsupported cli %q", k)
	}
	return t.ResetDefault()
}

func joinComma(xs []string) string {
	switch len(xs) {
	case 0:
		return ""
	case 1:
		return xs[0]
	default:
		s := xs[0]
		for i := 1; i < len(xs); i++ {
			s += ", " + xs[i]
		}
		return s
	}
}

func errWrongAdapter(wantCLI, wantStyles string, p profile.Profile) error {
	return fmt.Errorf("internal: wrong adapter for cli=%s style=%s (expected cli %s and style %s)", p.CLI, p.APIStyle, wantCLI, wantStyles)
}
