package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/clovapi/switcher/internal/desktop"
)

func cmdDesktop() *cobra.Command {
	c := &cobra.Command{
		Use:   "desktop",
		Short: "Desktop shell JSON API (profiles, auth, tests)",
	}
	c.AddCommand(cmdDesktopProfiles(), cmdDesktopProxy(), cmdDesktopVendor(), cmdDesktopAuth())
	return c
}

func writeDesktopJSON(v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	_, err = fmt.Println(string(data))
	return err
}

func cmdDesktopProfiles() *cobra.Command {
	c := &cobra.Command{
		Use:   "profiles",
		Short: "Load or save desktop profiles.json",
	}
	c.AddCommand(cmdDesktopProfilesLoad(), cmdDesktopProfilesSave(), cmdDesktopProfilesTest())
	return c
}

func cmdDesktopProfilesLoad() *cobra.Command {
	return &cobra.Command{
		Use:   "load",
		Short: "Load normalized profiles for the desktop UI",
		RunE: func(cmd *cobra.Command, args []string) error {
			return writeDesktopJSON(desktop.LoadProfiles())
		},
	}
}

func cmdDesktopProfilesSave() *cobra.Command {
	return &cobra.Command{
		Use:   "save",
		Short: "Save profiles from JSON on stdin",
		RunE: func(cmd *cobra.Command, args []string) error {
			data, err := io.ReadAll(os.Stdin)
			if err != nil {
				return err
			}
			input, err := desktop.ParseSaveInput(data)
			if err != nil {
				return err
			}
			return writeDesktopJSON(desktop.SaveProfiles(input))
		},
	}
}

func cmdDesktopProfilesTest() *cobra.Command {
	var providerID string
	var modelID string
	var port int
	c := &cobra.Command{
		Use:   "test",
		Short: "Probe a provider/model via the local proxy",
		RunE: func(cmd *cobra.Command, args []string) error {
			if strings.TrimSpace(providerID) == "" || strings.TrimSpace(modelID) == "" {
				return writeDesktopJSON(desktop.TestResult{OK: false, Passed: false, Error: "--provider and --model are required"})
			}
			return writeDesktopJSON(desktop.TestProviderModel(providerID, modelID, port))
		},
	}
	c.Flags().StringVar(&providerID, "provider", "", "Provider id")
	c.Flags().StringVar(&modelID, "model", "", "Model id")
	c.Flags().IntVar(&port, "port", 0, "Local proxy port override")
	return c
}

func cmdDesktopProxy() *cobra.Command {
	c := &cobra.Command{
		Use:   "proxy",
		Short: "Load or save local proxy bind settings",
	}
	c.AddCommand(cmdDesktopProxyLoad(), cmdDesktopProxySave())
	return c
}

func cmdDesktopProxyLoad() *cobra.Command {
	return &cobra.Command{
		Use:   "load",
		Short: "Load normalized proxy bind settings",
		RunE: func(cmd *cobra.Command, args []string) error {
			return writeDesktopJSON(desktop.LoadProxyConfig())
		},
	}
}

func cmdDesktopProxySave() *cobra.Command {
	return &cobra.Command{
		Use:   "save",
		Short: "Save proxy bind settings from JSON on stdin",
		RunE: func(cmd *cobra.Command, args []string) error {
			data, err := io.ReadAll(os.Stdin)
			if err != nil {
				return err
			}
			var input desktop.UIProxyConfig
			if err := json.Unmarshal(data, &input); err != nil {
				return fmt.Errorf("parse proxy save payload: %w", err)
			}
			return writeDesktopJSON(desktop.SaveProxyConfig(input))
		},
	}
}

func cmdDesktopVendor() *cobra.Command {
	c := &cobra.Command{
		Use:   "vendor",
		Short: "Vendor operations for the desktop UI",
	}
	c.AddCommand(cmdDesktopVendorListModels(), cmdDesktopVendorAdapters(), cmdDesktopVendorCatalog(), cmdDesktopVendorUsage())
	return c
}

func cmdDesktopVendorUsage() *cobra.Command {
	var vendorName string
	c := &cobra.Command{
		Use:   "usage",
		Short: "Query upstream quota/balance for one API vendor",
		RunE: func(cmd *cobra.Command, args []string) error {
			return writeDesktopJSON(desktop.QueryVendorUsage(vendorName))
		},
	}
	c.Flags().StringVar(&vendorName, "vendor", "", "Vendor display name")
	return c
}

func cmdDesktopVendorCatalog() *cobra.Command {
	return &cobra.Command{
		Use:   "catalog",
		Short: "List fixed providers and model adapter catalog",
		RunE: func(cmd *cobra.Command, args []string) error {
			return writeDesktopJSON(desktop.VendorCatalog())
		},
	}
}

func cmdDesktopVendorListModels() *cobra.Command {
	var vendorName string
	c := &cobra.Command{
		Use:   "list-models",
		Short: "Fetch and merge models for one vendor",
		RunE: func(cmd *cobra.Command, args []string) error {
			return writeDesktopJSON(desktop.ListVendorModels(vendorName))
		},
	}
	c.Flags().StringVar(&vendorName, "vendor", "", "Vendor display name")
	return c
}

func cmdDesktopVendorAdapters() *cobra.Command {
	return &cobra.Command{
		Use:   "adapters",
		Short: "List model adapter catalog",
		RunE: func(cmd *cobra.Command, args []string) error {
			catalog := desktop.VendorCatalog()
			return writeDesktopJSON(map[string]any{
				"ok":       catalog.OK,
				"adapters": catalog.Adapters,
			})
		},
	}
}

func cmdDesktopAuth() *cobra.Command {
	c := &cobra.Command{
		Use:   "auth",
		Short: "Subscription OAuth login/status/logout",
	}
	c.AddCommand(cmdDesktopAuthStatus(), cmdDesktopAuthLogin(), cmdDesktopAuthLogout())
	return c
}

func cmdDesktopAuthStatus() *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Report Claude/Codex subscription login status",
		RunE: func(cmd *cobra.Command, args []string) error {
			return writeDesktopJSON(desktop.AuthStatus())
		},
	}
}

func cmdDesktopAuthLogin() *cobra.Command {
	var providerID string
	var jsonFlag bool
	c := &cobra.Command{
		Use:   "login",
		Short: "Run subscription OAuth login",
		RunE: func(cmd *cobra.Command, args []string) error {
			_ = jsonFlag // desktop commands always return JSON.
			return writeDesktopJSON(desktop.AuthLogin(cmd.Context(), providerID))
		},
	}
	c.Flags().StringVar(&providerID, "provider", "", "Provider id: claude-code|codex")
	c.Flags().BoolVar(&jsonFlag, "json", false, "Return JSON (always enabled for desktop commands)")
	return c
}

func cmdDesktopAuthLogout() *cobra.Command {
	var providerID string
	c := &cobra.Command{
		Use:   "logout",
		Short: "Remove subscription OAuth credentials and clear vendor models",
		RunE: func(cmd *cobra.Command, args []string) error {
			return writeDesktopJSON(desktop.AuthLogout(providerID))
		},
	}
	c.Flags().StringVar(&providerID, "provider", "", "Provider id: claude-code|codex")
	return c
}
