package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/spf13/cobra"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/apply"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/testclient"
)

var (
	version = "dev"
	commit  = "none"
	date    = "unknown"
)

func main() {
	if err := newRoot().Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func newRoot() *cobra.Command {
	root := &cobra.Command{
		Use:           "clovapi",
		Short:         "One unified upstream API config → apply to Claude Code, Codex, OpenCode, OpenClaw, Hermes, Kimi Code CLI",
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	root.AddCommand(cmdProfiles(), cmdSet(), cmdRemove(), cmdSwitch(), cmdTest(), cmdReset(), cmdVersion())
	return root
}

func cmdProfiles() *cobra.Command {
	c := &cobra.Command{
		Use:   "profiles",
		Short: "Show saved profiles, CLI matrix, and active bindings",
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Println("CLI kind        | Supported API styles")
			fmt.Println("----------------|---------------------")
			for _, k := range apply.RegisteredKinds() {
				var styles []string
				for _, s := range apply.SupportedStyles(k) {
					styles = append(styles, string(s))
				}
				fmt.Printf("%-15s | %s\n", k, strings.Join(styles, ", "))
			}
			fmt.Println()

			s, err := profile.Load()
			if err != nil {
				return err
			}
			if len(s.List) > 0 {
				fmt.Println("Saved profiles:")
				fmt.Println("Name            CLI             Style      Model                 Base URL")
				fmt.Println("----------------+----------------+----------+----------------------+---------------------------")
				for _, p := range s.List {
					mod := truncate(p.Model, 20)
					if mod == "" {
						mod = "—"
					}
					cliCol := string(p.CLI)
					if cliCol == "" {
						cliCol = "—"
					}
					nm := truncate(p.Name, 15)
					if nm == "" {
						nm = "—"
					}
					fmt.Printf("%-15s %-15s %-10s %-21s %s\n", nm, cliCol, p.APIStyle, mod, truncate(p.BaseURL, 26))
				}
				fmt.Println()
			} else {
				fmt.Println("No saved profile yet. Run: clovapi set --name <name>")
				fmt.Println()
			}
			fmt.Println("Last applied (per CLI):")
			if len(s.Active) == 0 {
				fmt.Println("  (none)")
				return nil
			}
			for cli, name := range s.Active {
				fmt.Printf("  %s -> %s\n", cli, name)
			}
			return nil
		},
	}
	c.Aliases = []string{"list", "ls"}
	return c
}

func cmdSet() *cobra.Command {
	var (
		name, styleStr, baseURL, apiKey, model string
	)
	c := &cobra.Command{
		Use:   "set",
		Short: "Save one API profile (flags or prompts); connectivity test before save",
		Long: "Writes one profile under profiles list (name, api_style, base URL, key, model).\n" +
			"Use `clovapi switch --cli <kind>` to apply it into local CLI config.",
		RunE: func(cmd *cobra.Command, args []string) error {
			sc := bufio.NewScanner(os.Stdin)
			name = strings.TrimSpace(name)
			if name == "" {
				fmt.Print("Profile name (required): ")
				if !sc.Scan() {
					return fmt.Errorf("read name: %w", sc.Err())
				}
				name = strings.TrimSpace(sc.Text())
			}
			if name == "" {
				return fmt.Errorf("name is required (pass --name or input it interactively)")
			}

			if strings.TrimSpace(styleStr) == "" {
				fmt.Printf("API style (%s): ", apiStyleChoices())
				if !sc.Scan() {
					return fmt.Errorf("read style: %w", sc.Err())
				}
				styleStr = strings.TrimSpace(sc.Text())
			}
			st, err := apistyle.Parse(styleStr)
			if err != nil {
				return err
			}

			if strings.TrimSpace(baseURL) == "" {
				fmt.Print("Base URL (e.g. https://your-gateway/v1): ")
				if !sc.Scan() {
					return fmt.Errorf("read base url: %w", sc.Err())
				}
				baseURL = strings.TrimSpace(sc.Text())
			}

			if strings.TrimSpace(apiKey) == "" {
				fmt.Print("API key: ")
				if !sc.Scan() {
					return fmt.Errorf("read api key: %w", sc.Err())
				}
				apiKey = strings.TrimSpace(sc.Text())
			}
			if strings.TrimSpace(apiKey) == "" {
				return fmt.Errorf("api key is required (pass --api-key or input it interactively)")
			}

			if strings.TrimSpace(model) == "" {
				fmt.Print("Default model (required): ")
				if !sc.Scan() {
					return fmt.Errorf("read model: %w", sc.Err())
				}
				model = strings.TrimSpace(sc.Text())
			}
			if strings.TrimSpace(model) == "" {
				return fmt.Errorf("model is required")
			}

			fmt.Println("Testing connectivity…")
			if err := testclient.Probe(st, baseURL, apiKey, model); err != nil {
				return fmt.Errorf("connectivity test failed: %w", err)
			}
			fmt.Println("OK")

			s, err := profile.Load()
			if err != nil {
				return err
			}
			p := profile.Profile{
				Name:     name,
				APIStyle: st,
				BaseURL:  baseURL,
				APIKey:   apiKey,
				Model:    model,
			}
			existed := s.Index(p.Name) >= 0
			s.Upsert(p)
			if err := profile.Save(s); err != nil {
				return err
			}
			if existed {
				fmt.Printf("Profile %q overwritten.\n", p.Name)
			} else {
				fmt.Printf("Profile %q saved.\n", p.Name)
			}
			return nil
		},
	}
	c.Flags().StringVar(&name, "name", "", "Profile name (required)")
	c.Flags().StringVar(&styleStr, "api-style", "", "API style: claude|openai-chat|openai-responses|gemini (alias openai→openai-responses)")
	c.Flags().StringVar(&baseURL, "base-url", "", "Upstream base URL")
	c.Flags().StringVar(&apiKey, "api-key", "", "API key (or prompt)")
	c.Flags().StringVar(&model, "model", "", "Default model id (required; used for connectivity test and CLI config)")
	c.Aliases = []string{"add", "new"}
	return c
}

func cmdRemove() *cobra.Command {
	c := &cobra.Command{
		Use:   "remove NAME",
		Short: "Remove one saved profile from the profiles list",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			s, err := profile.Load()
			if err != nil {
				return err
			}
			if !s.Remove(args[0]) {
				return fmt.Errorf("profile %q not found", args[0])
			}
			return profile.Save(s)
		},
	}
	c.Aliases = []string{"rm", "delete"}
	return c
}

func cmdSwitch() *cobra.Command {
	var cliStr string
	c := &cobra.Command{
		Use:   "switch [PROFILE_NAME]",
		Short: "Apply one saved profile to one CLI",
		Long: "By default, switch uses that CLI's active profile; if absent, it uses the first profile for that CLI.\n" +
			"Optional PROFILE_NAME selects a profile by name from the profiles list.\n\n" +
			"Interactive mode (no --cli): pick CLI from PATH, then choose a profile or reset **that** CLI only.",
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			sc := bufio.NewScanner(os.Stdin)
			s, err := profile.Load()
			if err != nil {
				return err
			}

			kindStr := strings.TrimSpace(cliStr)
			var kind clikind.Kind
			if kindStr == "" {
				k, err := promptCLIPick(sc)
				if err != nil {
					return err
				}
				kind = k
			} else {
				k, err := clikind.Parse(kindStr)
				if err != nil {
					return err
				}
				kind = k
			}

			profileArg := ""
			if len(args) >= 1 {
				profileArg = strings.TrimSpace(args[0])
			}

			if kindStr == "" && profileArg == "" {
				picked, err := promptProfileActionForCLI(sc, kind, s)
				if err != nil {
					return err
				}
				if picked.reset {
					if err := apply.ResetDefault(kind); err != nil {
						return err
					}
					s.ClearActive(string(kind))
					if err := profile.Save(s); err != nil {
						return err
					}
					fmt.Printf("Reset %s to default (cleared clovapi relay bindings).\n", kind)
					return nil
				}
				return applyProfileToCLI(s, kind, picked.profile, picked.label)
			}

			p, ok := resolveProfileForSwitch(s, kind, profileArg)
			if profileArg != "" && !ok {
				return fmt.Errorf("profile %q not found", profileArg)
			}
			if !ok {
				return fmt.Errorf("no saved compatible profile for %s — run: clovapi set --name <name>", kind)
			}
			label := p.Name
			if strings.TrimSpace(profileArg) != "" {
				label = profileArg
			}
			return applyProfileToCLI(s, kind, p, label)
		},
	}
	c.Flags().StringVar(&cliStr, "cli", "", "Target CLI (omit to prompt): claude-code|codex|opencode|openclaw|hermes|kimi-code")
	c.Aliases = []string{"use"}
	return c
}

func resolveProfileForSwitch(s *profile.Store, kind clikind.Kind, profileName string) (profile.Profile, bool) {
	if strings.TrimSpace(profileName) != "" {
		p, ok := s.Get(strings.TrimSpace(profileName))
		if !ok {
			return profile.Profile{}, false
		}
		if (p.CLI != "" && p.CLI != kind) || !apply.KindSupportsStyle(kind, p.APIStyle) {
			return profile.Profile{}, false
		}
		return p, true
	}
	if p, ok := s.ActiveForCLI(string(kind)); ok {
		if (p.CLI == "" || p.CLI == kind) && apply.KindSupportsStyle(kind, p.APIStyle) {
			return p, true
		}
	}
	for _, p := range s.List {
		if (p.CLI == "" || p.CLI == kind) && apply.KindSupportsStyle(kind, p.APIStyle) {
			return p, true
		}
	}
	return profile.Profile{}, false
}

func applyProfileToCLI(s *profile.Store, kind clikind.Kind, p profile.Profile, label string) error {
	if !apply.KindSupportsStyle(kind, p.APIStyle) {
		return fmt.Errorf("cli %q does not support api_style %q (supported here: %s)", kind, p.APIStyle, styleChoices(kind))
	}
	pc := p
	pc.CLI = kind
	if err := apply.Apply(pc); err != nil {
		return err
	}
	activeLabel := strings.TrimSpace(label)
	if activeLabel == "" {
		activeLabel = p.Name
	}
	if strings.TrimSpace(activeLabel) == "" {
		activeLabel = string(kind)
	}
	s.SetActive(string(kind), activeLabel)
	if err := profile.Save(s); err != nil {
		return err
	}
	fmt.Printf("Applied profile %q to %s\n", activeLabel, kind)
	return nil
}

// promptCLIPick asks which agent CLI to target (no reset option — reset comes after selection).
func promptCLIPick(sc *bufio.Scanner) (clikind.Kind, error) {
	installed, notReady := apply.PartitionKindsByInstall()
	if len(installed) > 0 {
		fmt.Println("Choose CLI (installed on this machine):")
		for i, k := range installed {
			fmt.Printf("  %d) %s\n", i+1, k)
		}
	} else {
		fmt.Println("Choose CLI (no adapter executable found on PATH — type the CLI kind name):")
	}
	if len(notReady) > 0 {
		fmt.Println()
		fmt.Println("Not ready on this machine:")
		for _, k := range notReady {
			fmt.Printf("  %s\n", k)
		}
	}
	fmt.Print("Enter number or name: ")
	if !sc.Scan() {
		return "", fmt.Errorf("read cli: %w", sc.Err())
	}
	line := strings.TrimSpace(sc.Text())
	if line == "" {
		return "", fmt.Errorf("cli is required")
	}
	if n, err := strconv.Atoi(line); err == nil {
		if len(installed) == 0 {
			return "", fmt.Errorf("no numbered choices — type a CLI kind name (e.g. claude-code|opencode)")
		}
		if n < 1 || n > len(installed) {
			return "", fmt.Errorf("choose 1–%d or type e.g. claude-code", len(installed))
		}
		return installed[n-1], nil
	}
	return clikind.Parse(line)
}

type interactivePick struct {
	label   string
	profile profile.Profile
	reset   bool
}

func promptProfileActionForCLI(sc *bufio.Scanner, kind clikind.Kind, s *profile.Store) (interactivePick, error) {
	var picks []interactivePick
	fmt.Println()
	fmt.Printf("Choose profile for %s:\n", kind)
	fmt.Println("  0) reset this CLI to default (clear clovapi relay bindings)")
	for _, p := range s.List {
		if p.CLI != "" && p.CLI != kind {
			continue
		}
		if !apply.KindSupportsStyle(kind, p.APIStyle) {
			continue
		}
		name := strings.TrimSpace(p.Name)
		if name == "" {
			name = string(kind)
		}
		fmt.Printf("  %d) %s  (api_style=%s, model=%s)\n", len(picks)+1, name, p.APIStyle, modelShow(p.Model))
		picks = append(picks, interactivePick{
			label:   name,
			profile: p,
		})
	}
	if len(picks) == 0 {
		return interactivePick{}, fmt.Errorf("no compatible profile for %s — run `clovapi set --name <name>` first", kind)
	}
	fmt.Print("Enter number or name: ")
	if !sc.Scan() {
		return interactivePick{}, fmt.Errorf("read profile: %w", sc.Err())
	}
	line := strings.TrimSpace(sc.Text())
	if line == "" {
		return interactivePick{}, fmt.Errorf("profile selection is required")
	}
	if n, err := strconv.Atoi(line); err == nil {
		if n == 0 {
			return interactivePick{reset: true}, nil
		}
		if n < 1 || n > len(picks) {
			return interactivePick{}, fmt.Errorf("choose 0–%d", len(picks))
		}
		return picks[n-1], nil
	}
	for _, p := range picks {
		if strings.EqualFold(strings.TrimSpace(p.label), line) {
			return p, nil
		}
	}
	return interactivePick{}, fmt.Errorf("unknown profile %q", line)
}

func modelShow(m string) string {
	if strings.TrimSpace(m) == "" {
		return "—"
	}
	return m
}

func cmdReset() *cobra.Command {
	var yes bool
	c := &cobra.Command{
		Use:   "reset",
		Short: "Clear saved profiles and active bindings in profiles.json",
		Long: "Removes all profile rows and the active map from the clovapi state file.\n" +
			"Does not modify ~/.claude, ~/.codex, or opencode config already written by `clovapi switch`.",
		RunE: func(cmd *cobra.Command, args []string) error {
			s, err := profile.Load()
			if err != nil {
				return err
			}
			if len(s.List) == 0 && len(s.Active) == 0 {
				fmt.Println("Nothing to reset (store is already empty).")
				return nil
			}
			if !yes {
				fmt.Printf("This will delete %d profile(s) and all bindings. Continue? [y/N]: ", len(s.List))
				sc := bufio.NewScanner(os.Stdin)
				if !sc.Scan() {
					return sc.Err()
				}
				line := strings.ToLower(strings.TrimSpace(sc.Text()))
				if line != "y" && line != "yes" {
					fmt.Println("Aborted.")
					return nil
				}
			}
			if err := profile.Reset(); err != nil {
				return err
			}
			fmt.Println("Reset complete: profiles.json cleared.")
			return nil
		},
	}
	c.Flags().BoolVarP(&yes, "yes", "y", false, "Skip confirmation prompt")
	return c
}

func cmdTest() *cobra.Command {
	return &cobra.Command{
		Use:   "test [PROFILE_NAME]",
		Short: "Test connectivity for all saved profiles or one profile",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			s, err := profile.Load()
			if err != nil {
				return err
			}
			var list []profile.Profile
			if len(args) == 1 {
				p, ok := s.Get(args[0])
				if !ok {
					return fmt.Errorf("profile %q not found", args[0])
				}
				list = []profile.Profile{p}
			} else {
				if len(s.List) == 0 {
					return fmt.Errorf("no saved profile — run: clovapi set --name <name>")
				}
				list = append(list, s.List...)
			}
			var failed int
			for _, p := range list {
				label := strings.TrimSpace(p.Name)
				if label == "" {
					label = string(p.CLI)
				}
				if label == "" {
					label = "unnamed"
				}
				cliShow := string(p.CLI)
				if cliShow == "" {
					cliShow = "—"
				}
				fmt.Printf("Testing %q (%s / %s)… ", label, cliShow, p.APIStyle)
				if err := testclient.Probe(p.APIStyle, p.BaseURL, p.APIKey, p.Model); err != nil {
					fmt.Println("FAIL")
					fmt.Fprintf(os.Stderr, "  %v\n", err)
					failed++
					continue
				}
				fmt.Println("OK")
			}
			if failed > 0 {
				return fmt.Errorf("%d profile(s) failed", failed)
			}
			return nil
		},
	}
}

func cmdVersion() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print build version information",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("clovapi version %s\n", version)
			fmt.Printf("commit: %s\n", commit)
			fmt.Printf("built:  %s\n", date)
		},
	}
}

func apiStyleChoices() string {
	var o []string
	for _, s := range apistyle.All() {
		o = append(o, string(s))
	}
	return strings.Join(o, "|")
}

func styleChoices(k clikind.Kind) string {
	var o []string
	for _, s := range apply.SupportedStyles(k) {
		o = append(o, string(s))
	}
	return strings.Join(o, "|")
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	if max <= 3 {
		return s[:max]
	}
	return s[:max-3] + "..."
}
