package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/spf13/cobra"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/apply"
	"github.com/clovapi/switcher/internal/buildinfo"
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
		Long:  fmt.Sprintf("One Uniform API for Agents\n\n%s", buildinfo.Display()),
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
	root.AddCommand(cmdProfiles(), cmdProfilesGroup(), cmdSet(), cmdRemove(), cmdSwitch(), cmdProxy(), cmdReset(), cmdAuth(), cmdDesktop(), cmdVersion(), cmdUpdate(), cmdHiddenProxyDaemon())
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
				fmt.Println("Vendor          Kind           Models  Default model")
				fmt.Println("---------------+--------------+-------+----------------------")
				for _, p := range s.List {
					if !profile.IsAllowedUserVendorProfile(p) {
						continue
					}
					kindCol := strings.TrimSpace(p.Kind)
					if kindCol == "" {
						kindCol = "—"
					}
					modelCount := len(p.Models)
					defModel := truncate(p.Model, 20)
					if defModel == "" && modelCount > 0 {
						defModel = truncate(p.Models[0].ID, 20)
					}
					if defModel == "" {
						defModel = "—"
					}
					nm := truncate(p.Name, 15)
					fmt.Printf("%-15s %-14s %-7d %s\n", nm, kindCol, modelCount, defModel)
				}
				if len(s.Active) > 0 {
					fmt.Println()
					fmt.Println("Active selections:")
					for cli, selection := range s.Active {
						fmt.Printf("  %s -> %s/%s\n", cli, selection.ProviderID, selection.ModelID)
					}
				}
			}
			return nil
		},
	}
	c.Aliases = []string{"ls"}
	return c
}

func cmdSet() *cobra.Command {
	var (
		name, styleStr, baseURL, apiKey, model string
	)
	c := &cobra.Command{
		Use:   "add",
		Short: "Save one API profile (flags or prompts); connectivity test before save",
		Long: "Writes one vendor model under profiles list (name, api_style, base URL, key, model).\n" +
			"Prefer configuring vendors in the desktop app; use `clovapi switch --cli <kind>` to pick vendor and model.",
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

			p := profile.Profile{
				Name:     name,
				APIStyle: st,
				BaseURL:  baseURL,
				APIKey:   apiKey,
				Model:    model,
			}
			existed := false
			if _, err := profile.WithLockedStore(func(s *profile.Store) (bool, error) {
				existed = s.Index(p.Name) >= 0
				s.Upsert(p)
				return true, nil
			}); err != nil {
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
			removed := false
			if _, err := profile.WithLockedStore(func(s *profile.Store) (bool, error) {
				removed = s.Remove(args[0])
				if !removed {
					return false, nil
				}
				return true, nil
			}); err != nil {
				return err
			}
			if !removed {
				return fmt.Errorf("profile %q not found", args[0])
			}
			return nil
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
	var directAPIStyle string
	var bindingFlag string
	var providerFlag string
	var vendorFlag string
	var modelFlag string
	var jsonFlag bool
	c := &cobra.Command{
		Use:   "switch [VENDOR/MODEL]",
		Short: "Apply a vendor model binding to one CLI",
		Long: "Applies a @model:Vendor/model-id binding through the local proxy.\n\n" +
			"Non-interactive examples:\n" +
			"  clovapi switch --cli codex --vendor \"Codex Subscription\" --model gpt-5.5\n" +
			"  clovapi switch --cli codex \"Codex Subscription/gpt-5.5\"\n" +
			"  clovapi switch --cli codex --binding \"@model:Codex Subscription/gpt-5.5\"\n\n" +
			"Interactive mode (no vendor/model): pick CLI, vendor, then model.",
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			sc := newSwitchScanner()
			s, err := profile.Load()
			if err != nil {
				return err
			}

			kindStr := strings.TrimSpace(cliStr)
			var kind agentkind.Kind
			if kindStr == "" {
				k, err := promptCLIPick(sc)
				if err != nil {
					return err
				}
				kind = k
			} else {
				k, err := agentkind.Parse(kindStr)
				if err != nil {
					return err
				}
				kind = k
			}

			positional := ""
			if len(args) >= 1 {
				positional = strings.TrimSpace(args[0])
			}

			if jsonFlag {
				return runSwitchJSON(sc, s, kind, resetFlag, bindingFlag, providerFlag, vendorFlag, modelFlag, directBaseURL, directAPIKey, modelFlag, directAPIStyle, positional)
			}
			return runSwitch(sc, s, kind, resetFlag, bindingFlag, providerFlag, vendorFlag, modelFlag, directBaseURL, directAPIKey, modelFlag, directAPIStyle, positional)
		},
	}
	c.Flags().StringVar(&cliStr, "cli", "", "Target CLI (omit to prompt): claude-code|codex|opencode|openclaw|hermes|kimi-code")
	c.Flags().BoolVar(&resetFlag, "reset", false, "Clear clovapi relay bindings for this CLI only (use with --cli)")
	c.Flags().StringVar(&providerFlag, "provider", "", "Provider id (claude-code|codex|ollama|custom-api)")
	c.Flags().StringVar(&vendorFlag, "vendor", "", "Vendor name (e.g. Codex Subscription, Custom API)")
	c.Flags().StringVar(&modelFlag, "model", "", "Model id (with --vendor, or required with --base-url)")
	c.Flags().StringVar(&directBaseURL, "base-url", "", "Apply a custom endpoint directly (bypasses vendor bindings)")
	c.Flags().StringVar(&directAPIKey, "api-key", "clovapi-local", "API key written to CLI config when using --base-url")
	c.Flags().StringVar(&directAPIStyle, "api-style", "", "API style when using --base-url (default: openai-chat for opencode, claude for claude-code, etc.)")
	c.Flags().StringVar(&bindingFlag, "binding", "", "Model binding (@model:Vendor/model-id)")
	c.Flags().BoolVar(&jsonFlag, "json", false, "Return JSON")
	c.Aliases = []string{"use"}
	return c
}

// promptCLIPick asks which agent CLI to target (no reset option — reset comes after selection).
func promptCLIPick(sc *bufio.Scanner) (agentkind.Kind, error) {
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
	return agentkind.Parse(line)
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
		Long:  "The proxy is the headless core used by the desktop shell. It listens on /{providerId}/v1/... and infers API style from the endpoint path.",
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
	stop := &cobra.Command{
		Use:   "stop",
		Short: "Stop the background local proxy (graceful shutdown, then kill if needed)",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := resolveProxyConfig(host, port)
			if err != nil {
				return err
			}
			return runProxyStop(cfg, true)
		},
	}
	stop.Flags().StringVar(&host, "host", "", "Host the proxy listens on (default from profiles.json proxy.host)")
	stop.Flags().IntVar(&port, "port", 0, "Port the proxy listens on (default from profiles.json proxy.port)")
	var statusJSON bool
	status := &cobra.Command{
		Use:   "status",
		Short: "Check whether the local proxy responds to /health",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := resolveProxyConfig(host, port)
			if err != nil {
				return err
			}
			if statusJSON {
				return writeProxyStatusJSON(cfg, false)
			}
			snapshot := buildProxyStatusJSON(cfg, false)
			if snapshot.Error != "" && !snapshot.Running {
				return fmt.Errorf("proxy not reachable at %s: %s", snapshot.HealthURL, snapshot.Error)
			}
			fmt.Printf("%s status=%t %v\n", snapshot.HealthURL, snapshot.Running, snapshot.Body)
			if !snapshot.Running {
				return fmt.Errorf("proxy health check failed at %s", snapshot.HealthURL)
			}
			return nil
		},
	}
	status.Flags().StringVar(&host, "host", "", "Host the proxy listens on (default from profiles.json proxy.host)")
	status.Flags().IntVar(&port, "port", 0, "Port the proxy listens on (default from profiles.json proxy.port)")
	status.Flags().BoolVar(&statusJSON, "json", false, "Return JSON")
	var healthJSON bool
	health := &cobra.Command{
		Use:   "health",
		Short: "Probe local proxy /health (includes latency)",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := resolveProxyConfig(host, port)
			if err != nil {
				return err
			}
			if healthJSON {
				return writeProxyStatusJSON(cfg, true)
			}
			snapshot := buildProxyStatusJSON(cfg, true)
			if snapshot.Running {
				fmt.Printf("proxy healthy at %s (%dms)\n", snapshot.HealthURL, snapshot.LatencyMs)
				return nil
			}
			if snapshot.Error != "" {
				return fmt.Errorf("proxy health failed at %s: %s", snapshot.HealthURL, snapshot.Error)
			}
			return fmt.Errorf("proxy health failed at %s", snapshot.HealthURL)
		},
	}
	health.Flags().StringVar(&host, "host", "", "Host the proxy listens on (default from profiles.json proxy.host)")
	health.Flags().IntVar(&port, "port", 0, "Port the proxy listens on (default from profiles.json proxy.port)")
	health.Flags().BoolVar(&healthJSON, "json", false, "Return JSON")
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
	c.AddCommand(start, stop, status, health, config, cmdProxyLogs(), cmdProxySyslogs())
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
		Long:  "System logs are stored in ~/.config/clovapi/logs/system-logs.sqlite.",
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
				fmt.Println(syslog.FormatListLine(entry))
			}
			return nil
		},
	}
	listCmd.Flags().IntVar(&limit, "limit", syslog.DefaultListLimit, "Max entries to show (0 = all)")
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
			syslog.Write("system", s.LogSavedMessage())
			return nil
		},
	}

	c.AddCommand(listCmd, appendCmd, clearCmd, logProfilesCmd)
	return c
}

func cmdProxyLogs() *cobra.Command {
	var limit int
	var offset int
	var jsonOut bool
	var outPath string
	var yes bool
	var sessionID string

	c := &cobra.Command{
		Use:   "logs",
		Short: "Read and export persisted proxy call logs (SQLite)",
		Long:  "Call logs are stored in ~/.config/clovapi/logs/call-logs.sqlite.",
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
			defer store.Close()
			var entries []coreproxy.CallLogEntry
			if strings.TrimSpace(sessionID) != "" {
				entries = store.ListRecentSessionPage(limit, offset, sessionID)
			} else {
				entries = store.ListRecentPage(limit, offset)
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
	listCmd.Flags().IntVar(&limit, "limit", 20, "Max entries to show (0 = all)")
	listCmd.Flags().IntVar(&offset, "offset", 0, "Entries to skip before listing")
	listCmd.Flags().BoolVar(&jsonOut, "json", false, "Output JSON")
	listCmd.Flags().StringVar(&sessionID, "session", "", "Filter by session id (e.g. Claude Code session)")

	sessionsCmd := &cobra.Command{
		Use:   "sessions",
		Short: "List grouped call log sessions",
		RunE: func(cmd *cobra.Command, args []string) error {
			store := coreproxy.NewCallLogStore()
			defer store.Close()
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
			store := coreproxy.NewCallLogStore()
			defer store.Close()
			store.Clear()
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

func styleChoices(k agentkind.Kind) string {
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
