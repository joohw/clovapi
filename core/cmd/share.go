package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/clovapi/switcher/internal/sharing"
	"github.com/spf13/cobra"
)

func cmdShare() *cobra.Command {
	root := &cobra.Command{Use: "share", Short: "Connect your account and contribute configured local model APIs"}
	var platformURL, key, profileName, model string
	var dailyLimit int
	bind := &cobra.Command{Use: "bind", Hidden: true, Short: "Import a legacy node key", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		platform, err := sharing.NormalizePlatform(platformURL)
		if err != nil {
			return err
		}
		if key == "" {
			key = os.Getenv("CLOVAPI_NODE_KEY")
		}
		key = strings.TrimSpace(key)
		if key == "" || strings.ContainsAny(key, "\r\n") {
			return fmt.Errorf("provide --key or CLOVAPI_NODE_KEY")
		}
		profileName = strings.TrimSpace(profileName)
		model = strings.TrimSpace(model)
		if dailyLimit < 1 || dailyLimit > 100000 {
			return fmt.Errorf("daily-limit must be between 1 and 100000 requests")
		}
		if err = sharing.ValidateProfile(profileName, model); err != nil {
			return err
		}
		result, err := sharing.NewClient(platform, key).Bind(cmd.Context(), model)
		if err != nil {
			return err
		}
		dir, err := sharing.StateDir()
		if err != nil {
			return err
		}
		err = sharing.SaveBinding(dir, sharing.State{Platform: platform, Key: key, NodeID: result.NodeID, Profile: profileName, Model: model, DailyLimit: dailyLimit})
		if err != nil {
			return err
		}
		fmt.Fprintf(cmd.OutOrStdout(), "Bound model %s to node %s. Upstream credentials stay in the local profile.\nLocal ceiling: %d requests per UTC day; platform ceiling: %d.\nRun clovapi share start to accept requests.\n", model, result.NodeID, dailyLimit, result.DailyLimit)
		return nil
	}}
	bind.Flags().StringVar(&platformURL, "platform", "", "Platform origin URL (HTTPS, or loopback HTTP)")
	bind.Flags().StringVar(&key, "key", "", "Contribution node key (default CLOVAPI_NODE_KEY)")
	bind.Flags().StringVar(&profileName, "profile", "", "Saved local profile name, shown by clovapi list")
	bind.Flags().StringVar(&model, "model", "", "Exact model configured in the selected profile")
	bind.Flags().IntVar(&dailyLimit, "daily-limit", 100, "Local maximum attempted requests per UTC day")
	var connectionKey string
	var connectDailyLimit int
	start := &cobra.Command{Use: "start", Short: "Connect using the console key and contribute all configured models", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		dir, err := sharing.StateDir()
		if err != nil {
			return err
		}
		ctx, cancel := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
		defer cancel()
		cmd.SetContext(ctx)
		if err = ensureShareConnection(cmd, dir, connectionKey, connectDailyLimit); err != nil {
			return err
		}
		return (&sharing.Worker{Dir: dir, Log: cmd.OutOrStdout()}).Run(ctx)
	}}
	start.Flags().StringVar(&connectionKey, "key", "", "Account connection key from the console (only needed when connecting or reconnecting)")
	start.Flags().IntVar(&connectDailyLimit, "daily-limit", 100, "Local maximum attempts across all models per UTC day (default: saved limit, or 100)")
	root.AddCommand(start)
	var jsonOut bool
	status := &cobra.Command{Use: "status", Short: "Show connected node, synced models, pause state and local attempts", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		dir, err := sharing.StateDir()
		if err != nil {
			return err
		}
		s, err := sharing.Snapshot(dir, time.Now())
		if err != nil {
			return err
		}
		if jsonOut {
			return json.NewEncoder(cmd.OutOrStdout()).Encode(s)
		}
		fmt.Fprintf(cmd.OutOrStdout(), "Platform: %s\nNode: %s\nName: %s\nSynced models: %s\nKey: %s\nPaused locally: %t\nAttempts (%s UTC): %d / %d\nConcurrency: %d\n", s.Platform, s.NodeID, s.Name, strings.Join(s.Models, ", "), s.Key, s.Paused, s.Day, s.Used, s.DailyLimit, s.Concurrency)
		return nil
	}}
	status.Flags().BoolVar(&jsonOut, "json", false, "Output JSON with the key redacted")
	root.AddCommand(bind, status)
	for _, action := range []string{"pause", "resume"} {
		root.AddCommand(&cobra.Command{Use: action, Short: action + " acceptance of new shared requests", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
			dir, err := sharing.StateDir()
			if err != nil {
				return err
			}
			if err = sharing.SetPaused(dir, cmd.Name() == "pause"); err != nil {
				return err
			}
			fmt.Fprintln(cmd.OutOrStdout(), "Local sharing state updated. The worker applies it before accepting another request; an active request is allowed to finish.")
			return nil
		}})
	}
	return root
}

func ensureShareConnection(cmd *cobra.Command, dir, connectionKey string, dailyLimit int) error {
	saved, err := sharing.Read(dir)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	bound := err == nil
	if bound && !cmd.Flags().Changed("daily-limit") {
		dailyLimit = saved.DailyLimit
	}
	if dailyLimit < 1 || dailyLimit > 100000 {
		return errors.New("daily-limit must be between 1 and 100000 requests")
	}
	if cmd.Flags().Changed("key") {
		return sharing.Connect(cmd.Context(), dir, connectionKey, dailyLimit, cmd.OutOrStdout())
	}
	if !bound {
		return errors.New("copy the clovapi share start --key command from your console to connect this device")
	}
	if dailyLimit != saved.DailyLimit {
		return sharing.SetDailyLimit(dir, dailyLimit)
	}
	return nil
}
