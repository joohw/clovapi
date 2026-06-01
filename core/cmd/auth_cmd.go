package main

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/clovapi/switcher/internal/desktop"
)

func cmdAuth() *cobra.Command {
	c := &cobra.Command{
		Use:   "auth",
		Short: "Claude/Codex subscription OAuth login",
	}
	c.AddCommand(cmdAuthStatus(), cmdAuthLogin(), cmdAuthLogout())
	return c
}

func cmdAuthStatus() *cobra.Command {
	var jsonFlag bool
	c := &cobra.Command{
		Use:   "status",
		Short: "Report Claude/Codex subscription login status",
		RunE: func(cmd *cobra.Command, args []string) error {
			result := desktop.AuthStatus()
			if jsonFlag {
				return writeDesktopJSON(result)
			}
			return printAuthStatus(result)
		},
	}
	c.Flags().BoolVar(&jsonFlag, "json", false, "Return JSON")
	return c
}

func cmdAuthLogin() *cobra.Command {
	var providerID string
	var jsonFlag bool
	c := &cobra.Command{
		Use:   "login",
		Short: "Run subscription OAuth login in the browser",
		RunE: func(cmd *cobra.Command, args []string) error {
			result := desktop.AuthLogin(cmd.Context(), providerID)
			if jsonFlag {
				return writeDesktopJSON(result)
			}
			return printAuthLoginResult(result)
		},
	}
	c.Flags().StringVar(&providerID, "provider", "", "Provider id: claude-code|codex")
	c.Flags().BoolVar(&jsonFlag, "json", false, "Return JSON")
	return c
}

func cmdAuthLogout() *cobra.Command {
	var providerID string
	var jsonFlag bool
	c := &cobra.Command{
		Use:   "logout",
		Short: "Remove subscription OAuth credentials",
		RunE: func(cmd *cobra.Command, args []string) error {
			result := desktop.AuthLogout(providerID)
			if jsonFlag {
				return writeDesktopJSON(result)
			}
			return printAuthLogoutResult(result)
		},
	}
	c.Flags().StringVar(&providerID, "provider", "", "Provider id: claude-code|codex")
	c.Flags().BoolVar(&jsonFlag, "json", false, "Return JSON")
	return c
}

func printAuthStatus(result desktop.AuthStatusResult) error {
	if !result.OK {
		if msg := strings.TrimSpace(result.Error); msg != "" {
			return fmt.Errorf("%s", msg)
		}
		return fmt.Errorf("failed to read subscription status")
	}
	for _, item := range result.Items {
		state := "not logged in"
		if item.LoggedIn {
			state = "logged in"
		}
		summary := strings.TrimSpace(item.Summary)
		if summary != "" {
			fmt.Printf("%s (%s): %s — %s\n", item.Label, item.ID, state, summary)
		} else {
			fmt.Printf("%s (%s): %s\n", item.Label, item.ID, state)
		}
	}
	return nil
}

func printAuthLoginResult(result desktop.AuthLoginResult) error {
	if result.OK {
		fmt.Println("Subscription login succeeded.")
		if url := strings.TrimSpace(result.AuthorizeURL); url != "" {
			fmt.Println("If the browser did not open, visit:")
			fmt.Println(url)
		}
		return nil
	}
	if msg := strings.TrimSpace(result.Error); msg != "" {
		return fmt.Errorf("%s", msg)
	}
	return fmt.Errorf("subscription login failed")
}

func printAuthLogoutResult(result desktop.AuthLogoutResult) error {
	if result.OK {
		fmt.Println("Subscription logout succeeded.")
		return nil
	}
	if msg := strings.TrimSpace(result.Error); msg != "" {
		return fmt.Errorf("%s", msg)
	}
	return fmt.Errorf("subscription logout failed")
}
