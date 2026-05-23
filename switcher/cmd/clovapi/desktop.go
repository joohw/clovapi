package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/spf13/cobra"

	"github.com/clovapi/switcher/internal/clikind"
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
	var binding string
	var port int
	c := &cobra.Command{
		Use:   "test",
		Short: "Probe a @model binding via the local proxy",
		RunE: func(cmd *cobra.Command, args []string) error {
			return writeDesktopJSON(desktop.TestBinding(binding, port))
		},
	}
	c.Flags().StringVar(&binding, "binding", "", "Model binding (@model:Vendor/model-id)")
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
	c.AddCommand(cmdDesktopVendorListModels(), cmdDesktopVendorAdapters())
	return c
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
			return writeDesktopJSON(map[string]any{
				"ok":       true,
				"adapters": desktop.AdapterCatalog,
			})
		},
	}
}

func cmdDesktopAuth() *cobra.Command {
	c := &cobra.Command{
		Use:   "auth",
		Short: "Subscription OAuth status (login flow stays in the desktop shell)",
	}
	c.AddCommand(cmdDesktopAuthStatus(), cmdDesktopAuthLogout())
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

func applyBindingSwitch(kind clikind.Kind, binding string) error {
	if err := desktop.ApplyBinding(kind, binding); err != nil {
		return err
	}
	fmt.Printf("Applied binding %q to %s\n", binding, kind)
	return nil
}
