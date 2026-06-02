package main

import (
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/clovapi/switcher/internal/desktop"
)

func cmdProfilesGroup() *cobra.Command {
	c := &cobra.Command{
		Use:   "profiles",
		Short: "Load, save, and test profiles.json",
	}
	c.AddCommand(
		cmdProfilesLoad(),
		cmdProfilesSave(),
		cmdProfilesTest(),
		cmdProfilesListModels(),
		cmdProfilesUsage(),
		cmdProfilesCatalog(),
	)
	return c
}

func cmdProfilesLoad() *cobra.Command {
	var jsonFlag bool
	c := &cobra.Command{
		Use:   "load",
		Short: "Load normalized profiles for UI and scripts",
		RunE: func(cmd *cobra.Command, args []string) error {
			result := desktop.LoadProfiles()
			if jsonFlag {
				return writeDesktopJSON(result)
			}
			if !result.OK {
				if msg := result.Error; msg != "" {
					return fmt.Errorf("%s", msg)
				}
				return fmt.Errorf("failed to load profiles")
			}
			fmt.Printf("Loaded %d vendors from %s\n", len(result.Profiles), result.Path)
			return nil
		},
	}
	c.Flags().BoolVar(&jsonFlag, "json", false, "Return JSON")
	return c
}

func cmdProfilesSave() *cobra.Command {
	var jsonFlag bool
	c := &cobra.Command{
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
			result := desktop.SaveProfiles(input)
			if jsonFlag {
				return writeDesktopJSON(result)
			}
			if !result.OK {
				if msg := result.Error; msg != "" {
					return fmt.Errorf("%s", msg)
				}
				return fmt.Errorf("failed to save profiles")
			}
			fmt.Printf("Saved %d vendors to %s\n", len(result.Profiles), result.Path)
			return nil
		},
	}
	c.Flags().BoolVar(&jsonFlag, "json", false, "Return JSON")
	return c
}

func cmdProfilesTest() *cobra.Command {
	var binding string
	var providerID string
	var modelID string
	var port int
	var cliKind string
	var jsonFlag bool
	c := &cobra.Command{
		Use:   "test",
		Short: "Probe a provider/model via the local proxy",
		RunE: func(cmd *cobra.Command, args []string) error {
			var result desktop.TestResult
			if strings.TrimSpace(providerID) != "" || strings.TrimSpace(modelID) != "" {
				result = desktop.TestProviderModel(providerID, modelID, port, cliKind)
			} else {
				result = desktop.TestBinding(binding, port, cliKind)
			}
			if jsonFlag {
				return writeDesktopJSON(result)
			}
			return printProfileTestResult(result)
		},
	}
	c.Flags().StringVar(&providerID, "provider", "", "Provider id")
	c.Flags().StringVar(&modelID, "model", "", "Model id")
	c.Flags().StringVar(&binding, "binding", "", "Deprecated model binding (@model:Vendor/model-id)")
	c.Flags().IntVar(&port, "port", 0, "Local proxy port override")
	c.Flags().StringVar(&cliKind, "cli", "", "CLI kind for ingress style (e.g. codex|claude-code)")
	c.Flags().BoolVar(&jsonFlag, "json", false, "Return JSON")
	return c
}

func cmdProfilesListModels() *cobra.Command {
	var vendorName string
	var jsonFlag bool
	c := &cobra.Command{
		Use:   "list-models",
		Short: "Fetch and merge models for one vendor",
		RunE: func(cmd *cobra.Command, args []string) error {
			result := desktop.ListVendorModels(vendorName)
			if jsonFlag {
				return writeDesktopJSON(result)
			}
			return printVendorModelsResult(result)
		},
	}
	c.Flags().StringVar(&vendorName, "vendor", "", "Vendor display name")
	c.Flags().BoolVar(&jsonFlag, "json", false, "Return JSON")
	return c
}

func cmdProfilesUsage() *cobra.Command {
	var vendorName string
	var jsonFlag bool
	c := &cobra.Command{
		Use:   "usage",
		Short: "Query upstream quota/balance for one API vendor",
		RunE: func(cmd *cobra.Command, args []string) error {
			result := desktop.QueryVendorUsage(vendorName)
			if jsonFlag {
				return writeDesktopJSON(result)
			}
			if !result.OK {
				if msg := result.Error; msg != "" {
					return fmt.Errorf("%s", msg)
				}
				return fmt.Errorf("usage query failed")
			}
			fmt.Printf("Usage for %s:\n%s\n", strings.TrimSpace(result.Vendor), strings.TrimSpace(result.Text))
			return nil
		},
	}
	c.Flags().StringVar(&vendorName, "vendor", "", "Vendor display name")
	c.Flags().BoolVar(&jsonFlag, "json", false, "Return JSON")
	return c
}

func cmdProfilesCatalog() *cobra.Command {
	var jsonFlag bool
	c := &cobra.Command{
		Use:   "catalog",
		Short: "List fixed providers and model adapter catalog",
		RunE: func(cmd *cobra.Command, args []string) error {
			result := desktop.VendorCatalog()
			if jsonFlag {
				return writeDesktopJSON(result)
			}
			fmt.Printf("Providers: %d\n", len(result.Providers))
			return nil
		},
	}
	c.Flags().BoolVar(&jsonFlag, "json", false, "Return JSON")
	return c
}

func printProfileTestResult(result desktop.TestResult) error {
	if result.Passed {
		if summary := strings.TrimSpace(result.Summary); summary != "" {
			fmt.Println(summary)
		} else {
			fmt.Println("OK")
		}
		return nil
	}
	if msg := strings.TrimSpace(result.Error); msg != "" {
		return fmt.Errorf("%s", msg)
	}
	if summary := strings.TrimSpace(result.Summary); summary != "" {
		return fmt.Errorf("%s", summary)
	}
	return fmt.Errorf("connectivity test failed")
}

func printVendorModelsResult(result desktop.ListModelsResult) error {
	if !result.OK {
		if msg := strings.TrimSpace(result.Error); msg != "" {
			return fmt.Errorf("%s", msg)
		}
		return fmt.Errorf("failed to list vendor models")
	}
	count := len(result.Models)
	if count == 0 && len(result.Profiles) > 0 {
		count = len(result.Profiles)
	}
	fmt.Printf("Fetched %d models\n", count)
	return nil
}
