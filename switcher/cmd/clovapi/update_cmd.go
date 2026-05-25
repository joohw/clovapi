package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/clovapi/switcher/internal/buildinfo"
	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/selfupdate"
)

func cmdVersion() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print clovapi version",
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Printf("clovapi %s\n", buildinfo.Display())
			if c := strings.TrimSpace(buildinfo.Commit); c != "" && c != "none" {
				fmt.Printf("commit: %s\n", c)
			}
			if d := strings.TrimSpace(buildinfo.Date); d != "" && d != "unknown" {
				fmt.Printf("built: %s\n", d)
			}
			if path, err := config.CliBinPath(); err == nil {
				if st, err := os.Stat(path); err == nil && !st.IsDir() {
					fmt.Printf("user cli: %s\n", path)
				}
			}
			return nil
		},
	}
}

func cmdUpdate() *cobra.Command {
	var (
		versionTag string
		targetPath string
		inPlace    bool
		checkOnly  bool
		jsonOut    bool
	)
	c := &cobra.Command{
		Use:   "update",
		Short: "Download and install a newer clovapi release",
		Long: "Downloads the official release archive for this OS/arch and installs it into the user config bin directory by default (~/.config/clovapi/bin or %APPDATA%\\clovapi\\bin).\n" +
			"Desktop apps prefer this path over the bundled CLI, so the CLI can be updated without reinstalling the app.",
		RunE: func(cmd *cobra.Command, args []string) error {
			execPath, err := os.Executable()
			if err != nil {
				return err
			}
			opts := selfupdate.Options{
				VersionTag: strings.TrimSpace(versionTag),
				InPlace:    inPlace,
				CheckOnly:  checkOnly,
			}
			if v := strings.TrimSpace(targetPath); v != "" {
				opts.TargetPath = v
			}
			res, err := selfupdate.Update(cmd.Context(), execPath, opts)
			if jsonOut {
				enc := json.NewEncoder(os.Stdout)
				enc.SetIndent("", "  ")
				if encErr := enc.Encode(res); encErr != nil {
					return encErr
				}
			}
			if err != nil {
				return err
			}
			if jsonOut {
				return nil
			}
			if checkOnly {
				if res.UpToDate {
					fmt.Printf("clovapi %s is up to date\n", buildinfo.Display())
					return nil
				}
				fmt.Printf("update available: %s -> %s\n", buildinfo.Display(), res.LatestVersion)
				fmt.Printf("install with: clovapi update\n")
				return nil
			}
			if res.UpToDate {
				fmt.Printf("clovapi %s is already up to date (%s)\n", buildinfo.Display(), res.TargetPath)
				return nil
			}
			fmt.Printf("updated clovapi to %s\n", res.LatestVersion)
			fmt.Printf("installed: %s\n", res.TargetPath)
			fmt.Println("restart the desktop app or proxy process to pick up the new binary")
			return nil
		},
	}
	c.Flags().StringVar(&versionTag, "version", "", "Release tag or version to install (default: latest)")
	c.Flags().StringVar(&targetPath, "target", "", "Install path override (default: user config bin directory)")
	c.Flags().BoolVar(&inPlace, "in-place", false, "Replace the running executable (Unix only)")
	c.Flags().BoolVar(&checkOnly, "check", false, "Only check whether a newer release is available")
	c.Flags().BoolVar(&jsonOut, "json", false, "Print result as JSON")
	return c
}
