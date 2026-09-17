package main

import (
	"os"
	"os/signal"
	"syscall"

	"github.com/clovapi/switcher/internal/relay"
	"github.com/spf13/cobra"
)

func cmdRelay() *cobra.Command {
	listen := relay.DefaultListen()
	controlPlane := relay.EnvironmentConfig().ControlPlaneURL
	cmd := &cobra.Command{Use: "relay", Short: "Serve platform APIs and persistent contributor connections", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		ctx, cancel := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
		defer cancel()
		return relay.Serve(ctx, listen, controlPlane)
	}}
	cmd.Flags().StringVar(&listen, "listen", listen, "Public HTTP listen address")
	cmd.Flags().StringVar(&controlPlane, "control-plane", controlPlane, "Private Next.js control plane origin")
	return cmd
}
