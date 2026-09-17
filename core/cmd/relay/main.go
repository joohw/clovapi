// The standalone relay does not embed the local management UI or proxy core.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/clovapi/switcher/internal/relay"
)

func main() {
	listen := flag.String("listen", relay.DefaultListen(), "Public HTTP listen address")
	controlPlane := flag.String("control-plane", relay.EnvironmentConfig().ControlPlaneURL, "Private Next.js control plane origin")
	flag.Parse()
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	if err := relay.Serve(ctx, *listen, *controlPlane); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
