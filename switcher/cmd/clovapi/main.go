package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/apply"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/profile"
	coreproxy "github.com/clovapi/switcher/internal/proxy"
	"github.com/clovapi/switcher/internal/syslog"
	"github.com/clovapi/switcher/internal/testclient"
)

func main() {
	if err := newRoot().Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func newRoot() *cobra.Command {
	root := &cobra.Command{
		Use:   "clovapi",
		Short: "One Uniform API for Agents",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
		SilenceUsage:  true,
		SilenceErrors: true,
		PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
			if shouldSkipAutoProxy(cmd) {
				return nil
			}
			return ensureProxyRunning()
		},
	}
	root.CompletionOptions.DisableDefaultCmd = true
	root.AddCommand(cmdProfiles(), cmdSet(), cmdRemove(), cmdSwitch(), cmdProxy(), cmdReset(), cmdDesktop(), cmdHiddenProxyDaemon())
	return root
}

func cmdProfiles() *cobra.Command {
	c := &cobra.Command{
		Use:   "list",
		Short: "Show saved profiles",
		RunE: func(cmd *cobra.Command, args []string) error {
			s, err := profile.Load()
			if err != nil {
				return err
			}
			if len(s.List) > 0 {
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
			}
			return nil
		},
	}
	c.Aliases = []string{"profiles", "ls"}
	return c
}

func cmdSet() *cobra.Command {
	var (
		name, styleStr, baseURL, apiKey, model string
	)
	c := &cobra.Command{
		Use:   "add",
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

			fmt.Println("Testing connectivity...")
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
	c.Aliases = []string{"set", "new"}
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
	var resetFlag bool
	var directBaseURL string
	var directAPIKey string
	var directModel string
	var directAPIStyle string
	var bindingFlag string
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

			if resetFlag {
				if profileArg != "" {
					return fmt.Errorf("cannot use --reset with a profile name argument")
				}
				if strings.TrimSpace(directBaseURL) != "" || strings.TrimSpace(bindingFlag) != "" {
					return fmt.Errorf("cannot use --reset with --base-url or --binding")
				}
				if err := apply.ResetDefault(kind); err != nil {
					return err
				}
				syslog.LogCLIReset(kind)
				s.ClearActive(string(kind))
				if err := profile.Save(s); err != nil {
					return err
				}
				fmt.Printf("Reset %s to default (cleared clovapi relay bindings).\n", kind)
				return nil
			}

			if strings.TrimSpace(bindingFlag) != "" {
				if profileArg != "" {
					return fmt.Errorf("cannot use profile name with --binding")
				}
				if strings.TrimSpace(directBaseURL) != "" {
					return fmt.Errorf("cannot use --binding with --base-url")
				}
				return applyBindingSwitch(kind, bindingFlag)
			}

			if strings.TrimSpace(directBaseURL) != "" {
				if profileArg != "" {
					return fmt.Errorf("cannot use profile name with --base-url (pass --model and optional --api-style instead)")
				}
				return applyDirectToCLI(kind, directBaseURL, directAPIKey, directModel, directAPIStyle)
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
				return fmt.Errorf("no saved compatible profile for %s — run: clovapi add --name <name>", kind)
			}
			label := p.Name
			if strings.TrimSpace(profileArg) != "" {
				label = profileArg
			}
			return applyProfileToCLI(s, kind, p, label)
		},
	}
	c.Flags().StringVar(&cliStr, "cli", "", "Target CLI (omit to prompt): claude-code|codex|opencode|openclaw|hermes|kimi-code")
	c.Flags().BoolVar(&resetFlag, "reset", false, "Clear clovapi relay bindings for this CLI only (use with --cli)")
	c.Flags().StringVar(&directBaseURL, "base-url", "", "Apply endpoint directly (desktop local proxy); do not use a saved profile or __local_proxy_* stub")
	c.Flags().StringVar(&directAPIKey, "api-key", "clovapi-local", "API key written to CLI config when using --base-url")
	c.Flags().StringVar(&directModel, "model", "", "Model id written to CLI config when using --base-url (required with --base-url)")
	c.Flags().StringVar(&directAPIStyle, "api-style", "", "API style when using --base-url (default: openai-chat for opencode, claude for claude-code, etc.)")
	c.Flags().StringVar(&bindingFlag, "binding", "", "Desktop @model:Vendor/model-id binding (computes local proxy ingress and applies)")
	c.Aliases = []string{"use"}
	return c
}

func applyDirectToCLI(kind clikind.Kind, baseURL, apiKey, model, styleStr string) error {
	mod := strings.TrimSpace(model)
	if mod == "" {
		return fmt.Errorf("--model is required with --base-url")
	}
	st, err := apistyle.Parse(strings.TrimSpace(styleStr))
	if err != nil {
		if strings.TrimSpace(styleStr) != "" {
			return err
		}
		switch kind {
		case clikind.ClaudeCode, clikind.KimiCode:
			st = apistyle.Claude
		case clikind.Codex:
			st = apistyle.OpenAIResponses
		default:
			st = apistyle.OpenAIChat
		}
	}
	key := strings.TrimSpace(apiKey)
	if key == "" {
		key = "clovapi-local"
	}
	p := profile.Profile{
		Name:     "__direct__",
		CLI:      kind,
		BaseURL:  strings.TrimSpace(baseURL),
		APIKey:   key,
		Model:    mod,
		APIStyle: st,
	}
	if !apply.KindSupportsStyle(kind, p.APIStyle) {
		return fmt.Errorf("cli %q does not support api_style %q (supported here: %s)", kind, p.APIStyle, styleChoices(kind))
	}
	if err := apply.Apply(p); err != nil {
		return err
	}
	fmt.Printf("Applied direct endpoint to %s (model %q)\n", kind, mod)
	return nil
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
	activeLabel := strings.TrimSpace(label)
	if activeLabel == "" {
		activeLabel = strings.TrimSpace(p.Name)
	}
	if strings.HasPrefix(activeLabel, profile.ModelBindingPrefix) {
		return applyBindingSwitch(kind, activeLabel)
	}
	if !apply.KindSupportsStyle(kind, p.APIStyle) {
		return fmt.Errorf("cli %q does not support api_style %q (supported here: %s)", kind, p.APIStyle, styleChoices(kind))
	}
	pc := p
	pc.CLI = kind
	if err := apply.Apply(pc); err != nil {
		return err
	}
	if activeLabel == "" {
		activeLabel = p.Name
	}
	if strings.TrimSpace(activeLabel) == "" {
		activeLabel = string(kind)
	}
	// Desktop local-proxy stubs use __local_proxy_*; do not overwrite UI @model: bindings in active.
	if !strings.HasPrefix(strings.TrimSpace(p.Name), "__local_proxy_") {
		s.SetActive(string(kind), activeLabel)
	}
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
		return interactivePick{}, fmt.Errorf("no compatible profile for %s — run `clovapi add --name <name>` first", kind)
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

func cmdProxy() *cobra.Command {
	var host string
	var port int
	c := &cobra.Command{
		Use:   "proxy",
		Short: "Run and inspect the built-in local proxy core",
		Long:  "The proxy is the headless core used by the desktop shell. It listens on /{providerId}/{modelId}/{apiStyle}/v1/...",
	}
	start := &cobra.Command{
		Use:   "start",
		Short: "Start the local proxy in the background (no-op if already running)",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := resolveProxyConfig(host, port)
			if err != nil {
				return err
			}
			return runProxyStart(cfg, true)
		},
	}
	start.Flags().StringVar(&host, "host", "", "Host to listen on (default from profiles.json proxy.host)")
	start.Flags().IntVar(&port, "port", 0, "Port to listen on (default from profiles.json proxy.port)")
	status := &cobra.Command{
		Use:   "status",
		Short: "Check whether the local proxy responds to /health",
		RunE: func(cmd *cobra.Command, args []string) error {
			s, err := profile.Load()
			if err != nil {
				return err
			}
			cfg := coreproxy.NewServer(s.Proxy).Config
			client := http.Client{Timeout: 2 * time.Second}
			url := fmt.Sprintf("http://%s:%d/health", cfg.Host, cfg.Port)
			resp, err := client.Get(url)
			if err != nil {
				return fmt.Errorf("proxy not reachable at %s: %w", url, err)
			}
			defer resp.Body.Close()
			var body map[string]any
			if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
				return err
			}
			fmt.Printf("%s status=%d %v\n", url, resp.StatusCode, body)
			if resp.StatusCode != http.StatusOK {
				return fmt.Errorf("proxy health returned status %d", resp.StatusCode)
			}
			return nil
		},
	}
	config := &cobra.Command{
		Use:   "config",
		Short: "Print the proxy config from profiles.json",
		RunE: func(cmd *cobra.Command, args []string) error {
			s, err := profile.Load()
			if err != nil {
				return err
			}
			data, err := json.MarshalIndent(s.Proxy, "", "  ")
			if err != nil {
				return err
			}
			fmt.Println(string(data))
			return nil
		},
	}
	c.AddCommand(start, status, config, cmdProxyLogs(), cmdProxySyslogs())
	return c
}

func cmdProxySyslogs() *cobra.Command {
	var limit int
	var jsonOut bool
	var jsonPayload string
	var yes bool

	c := &cobra.Command{
		Use:   "syslogs",
		Short: "Read and append persisted system logs (SQLite)",
		Long:  "System logs are stored in ~/.config/clovapi/call-logs/system-logs.sqlite.",
	}

	listCmd := &cobra.Command{
		Use:   "list",
		Short: "List recent system log entries",
		RunE: func(cmd *cobra.Command, args []string) error {
			entries, err := syslog.List(limit)
			if err != nil {
				return err
			}
			if jsonOut {
				data, err := json.MarshalIndent(entries, "", "  ")
				if err != nil {
					return err
				}
				fmt.Println(string(data))
				return nil
			}
			if len(entries) == 0 {
				fmt.Println("(no system logs)")
				return nil
			}
			for _, entry := range entries {
				fmt.Printf("%s  %s  [%s]  %s\n", entry.ID, entry.At, entry.Stream, entry.Message)
			}
			return nil
		},
	}
	listCmd.Flags().IntVar(&limit, "limit", 0, "Max entries to show (0 = all)")
	listCmd.Flags().BoolVar(&jsonOut, "json", false, "Output JSON")

	appendCmd := &cobra.Command{
		Use:   "append",
		Short: "Append one or more system log entries from JSON",
		Long:  "Pass JSON array via --json or stdin. Each item: {\"at\":\"...\",\"stream\":\"system\",\"message\":\"...\"}.",
		RunE: func(cmd *cobra.Command, args []string) error {
			raw := strings.TrimSpace(jsonPayload)
			if raw == "" {
				data, err := os.ReadFile("/dev/stdin")
				if err != nil {
					return err
				}
				raw = strings.TrimSpace(string(data))
			}
			if raw == "" {
				return fmt.Errorf("system log JSON payload is required")
			}
			var entries []syslog.Entry
			if err := json.Unmarshal([]byte(raw), &entries); err != nil {
				return err
			}
			if len(entries) == 0 {
				return nil
			}
			return syslog.Append(entries)
		},
	}
	appendCmd.Flags().StringVar(&jsonPayload, "json", "", "JSON array of system log entries")

	clearCmd := &cobra.Command{
		Use:   "clear",
		Short: "Clear persisted system logs",
		RunE: func(cmd *cobra.Command, args []string) error {
			if !yes {
				fmt.Print("Clear all persisted system logs? [y/N]: ")
				reader := bufio.NewReader(os.Stdin)
				line, err := reader.ReadString('\n')
				if err != nil {
					return err
				}
				line = strings.TrimSpace(strings.ToLower(line))
				if line != "y" && line != "yes" {
					fmt.Println("Aborted.")
					return nil
				}
			}
			if err := syslog.Clear(); err != nil {
				return err
			}
			fmt.Println("System logs cleared.")
			return nil
		},
	}
	clearCmd.Flags().BoolVarP(&yes, "yes", "y", false, "Skip confirmation prompt")

	logProfilesCmd := &cobra.Command{
		Use:    "log-profiles",
		Short:  "Write a system log entry summarizing current profiles.json",
		Hidden: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			s, err := profile.Load()
			if err != nil {
				return err
			}
			path, err := profile.ProfilesPath()
			if err != nil {
				return err
			}
			syslog.Write("system", fmt.Sprintf("[profiles] saved %s — %s", path, s.LogSummary()))
			return nil
		},
	}

	c.AddCommand(listCmd, appendCmd, clearCmd, logProfilesCmd)
	return c
}

func cmdProxyLogs() *cobra.Command {
	var limit int
	var jsonOut bool
	var outPath string
	var yes bool
	var sessionID string

	c := &cobra.Command{
		Use:   "logs",
		Short: "Read and export persisted proxy call logs (SQLite)",
		Long:  "Call logs are stored in ~/.config/clovapi/call-logs/call-logs.sqlite. Existing JSONL shards are imported once on first open.",
	}

	pathCmd := &cobra.Command{
		Use:   "path",
		Short: "Print the call log SQLite database path",
		RunE: func(cmd *cobra.Command, args []string) error {
			p, err := coreproxy.CallLogsDBPath()
			if err != nil {
				return err
			}
			fmt.Println(p)
			return nil
		},
	}

	listCmd := &cobra.Command{
		Use:   "list",
		Short: "List recent call log entries",
		RunE: func(cmd *cobra.Command, args []string) error {
			store := coreproxy.NewCallLogStore()
			var entries []coreproxy.CallLogEntry
			if strings.TrimSpace(sessionID) != "" {
				entries = store.ListRecentSession(limit, sessionID)
			} else {
				entries = store.ListRecent(limit)
			}
			if jsonOut {
				data, err := json.MarshalIndent(entries, "", "  ")
				if err != nil {
					return err
				}
				fmt.Println(string(data))
				return nil
			}
			if len(entries) == 0 {
				fmt.Println("(no call logs)")
				return nil
			}
			for _, entry := range entries {
				statusText := "pending"
				if entry.Upstream.Status != 0 {
					statusText = fmt.Sprintf("HTTP %d", entry.Upstream.Status)
				}
				fmt.Printf("%s  %s  %s %s  %s  %dms\n",
					entry.ID,
					entry.StartedAt,
					entry.Request.Method,
					entry.Request.URL,
					statusText,
					entry.DurationMs,
				)
			}
			return nil
		},
	}
	listCmd.Flags().IntVar(&limit, "limit", 50, "Max entries to show (0 = all)")
	listCmd.Flags().BoolVar(&jsonOut, "json", false, "Output JSON")
	listCmd.Flags().StringVar(&sessionID, "session", "", "Filter by session id (e.g. Claude Code session)")

	sessionsCmd := &cobra.Command{
		Use:   "sessions",
		Short: "List grouped call log sessions",
		RunE: func(cmd *cobra.Command, args []string) error {
			store := coreproxy.NewCallLogStore()
			items := store.ListSessions(limit)
			if jsonOut {
				data, err := json.MarshalIndent(items, "", "  ")
				if err != nil {
					return err
				}
				fmt.Println(string(data))
				return nil
			}
			if len(items) == 0 {
				fmt.Println("(no sessions)")
				return nil
			}
			for _, item := range items {
				fmt.Printf("%s  kind=%s  entries=%d  last=%s\n",
					item.SessionID,
					item.SessionKind,
					item.EntryCount,
					item.LastStartedAt,
				)
			}
			return nil
		},
	}
	sessionsCmd.Flags().IntVar(&limit, "limit", 50, "Max sessions to show (0 = all)")
	sessionsCmd.Flags().BoolVar(&jsonOut, "json", false, "Output JSON")

	readCmd := &cobra.Command{
		Use:   "read <id>",
		Short: "Print one call log entry as JSON",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			entry, err := coreproxy.FindCallLogEntry(args[0])
			if err != nil {
				return err
			}
			data, err := json.MarshalIndent(entry, "", "  ")
			if err != nil {
				return err
			}
			fmt.Println(string(data))
			return nil
		},
	}

	exportCmd := &cobra.Command{
		Use:   "export",
		Short: "Export call logs as JSONL",
		Long:  "Writes all stored entries as JSONL to stdout or --out. Suitable for RL / training pipelines.",
		RunE: func(cmd *cobra.Command, args []string) error {
			var out *os.File
			if strings.TrimSpace(outPath) == "" || outPath == "-" {
				out = os.Stdout
			} else {
				var err error
				out, err = os.Create(outPath)
				if err != nil {
					return err
				}
				defer out.Close()
			}
			n, err := coreproxy.ExportCallLogs(out)
			if err != nil {
				return err
			}
			if out != os.Stdout {
				fmt.Fprintf(os.Stderr, "exported %d entries to %s\n", n, outPath)
			}
			return nil
		},
	}
	exportCmd.Flags().StringVar(&outPath, "out", "-", "Output file (- for stdout)")

	clearCmd := &cobra.Command{
		Use:   "clear",
		Short: "Clear persisted call logs",
		RunE: func(cmd *cobra.Command, args []string) error {
			if !yes {
				fmt.Print("Clear all persisted call logs? [y/N]: ")
				reader := bufio.NewReader(os.Stdin)
				line, err := reader.ReadString('\n')
				if err != nil {
					return err
				}
				line = strings.TrimSpace(strings.ToLower(line))
				if line != "y" && line != "yes" {
					fmt.Println("Aborted.")
					return nil
				}
			}
			coreproxy.NewCallLogStore().Clear()
			fmt.Println("Call logs cleared.")
			return nil
		},
	}
	clearCmd.Flags().BoolVarP(&yes, "yes", "y", false, "Skip confirmation prompt")

	c.AddCommand(pathCmd, listCmd, sessionsCmd, readCmd, exportCmd, clearCmd)
	return c
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
