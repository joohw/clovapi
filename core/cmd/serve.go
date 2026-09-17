package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/clovapi/switcher/internal/buildinfo"
	"github.com/clovapi/switcher/internal/desktop"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/webadmin"
	"github.com/spf13/cobra"
)

// The management listener survives proxy stop/rebind. Only this controller's
// proxy operations are serialized; profiles and log reads remain independent.
type browserProxy struct {
	mu     sync.Mutex
	active profile.ProxyConfig
}

func (p *browserProxy) status() (any, error) {
	cfg := desktop.LoadProxyConfig()
	if !cfg.OK {
		return nil, fmt.Errorf("%s", cfg.Error)
	}
	status := buildProxyStatusJSON(p.active, true)
	return struct {
		proxyStatusJSON
		Config desktop.UIProxyConfig `json:"config"`
		URL    string                `json:"url"`
	}{status, cfg.Proxy, status.HealthURL}, nil
}
func (p *browserProxy) Status() (any, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.status()
}
func (p *browserProxy) Start(port int, host string) (any, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	cfg, err := resolveProxyConfig(host, port)
	if err != nil {
		return nil, err
	}
	if cfg.Port < 1 || cfg.Port > 65535 {
		return nil, fmt.Errorf("invalid proxy port")
	}
	if cfg.Host != p.active.Host || cfg.Port != p.active.Port {
		if running, _ := probeProxyHealth(p.active); running {
			if err := runProxyStop(p.active, false); err != nil {
				return nil, err
			}
		}
	}
	// Replace an earlier core when launching the browser build, as the former
	// dev desktop did. Never kill a listener that isn't a clovapi proxy.
	if running, body, _, _ := probeProxyHealthBody(cfg); running && body["version"] != buildinfo.Display() {
		if err := runProxyStop(cfg, false); err != nil {
			return nil, err
		}
	}
	if err := runProxyStart(cfg, false); err != nil {
		return nil, err
	}
	p.active = cfg
	return p.status()
}
func (p *browserProxy) Stop() (any, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if err := runProxyStop(p.active, false); err != nil {
		return nil, err
	}
	return p.status()
}
func (p *browserProxy) Save(input desktop.UIProxyConfig) (any, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if input.Port < 1 || input.Port > 65535 || strings.TrimSpace(input.Host) == "" {
		return nil, fmt.Errorf("proxy host and a port between 1 and 65535 required")
	}
	// Keep active unchanged until Start so a rebind stops the old address first.
	return desktop.SaveProxyConfig(input), nil
}

func cmdServe() *cobra.Command {
	var port int
	var dev, noProxy bool
	c := &cobra.Command{
		Use:   "serve",
		Short: "Serve the browser management UI on localhost",
		RunE: func(cmd *cobra.Command, args []string) error {
			if port < 1 || port > 65535 {
				return fmt.Errorf("invalid management port")
			}
			cfg, err := resolveProxyConfig("", 0)
			if err != nil {
				return err
			}
			address := net.JoinHostPort("127.0.0.1", strconv.Itoa(port))
			listener, err := net.Listen("tcp", address)
			if err != nil {
				return fmt.Errorf("management address %s: %w", address, err)
			}
			defer listener.Close()
			controller := &browserProxy{active: cfg}
			admin := &webadmin.Server{Proxy: controller, Dev: dev || strings.HasPrefix(buildinfo.Display(), "dev"), Authorities: []string{address, "localhost:" + strconv.Itoa(port)}}
			if dev {
				admin.Authorities = append(admin.Authorities, "127.0.0.1:31873", "localhost:31873")
				ui := httputil.NewSingleHostReverseProxy(&url.URL{Scheme: "http", Host: "127.0.0.1:31873"})
				ui.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
					http.Error(w, "Vite development server unavailable. Run npm run dev:web from the repository root.", http.StatusBadGateway)
				}
				admin.DevUI = ui
			}
			defer admin.Close()
			ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
			defer stop()
			server := &http.Server{Handler: admin.Handler(), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second,
				BaseContext: func(net.Listener) context.Context { return ctx }}
			fmt.Printf("Clov API %s\nOpen http://%s in your browser.\n", buildinfo.Display(), address)
			if dev {
				fmt.Println("Development UI: Vite hot reload is enabled on this address.")
			}
			if !noProxy && cfg.Enabled {
				if _, err := controller.Start(0, ""); err != nil {
					fmt.Fprintf(os.Stderr, "Proxy startup failed (management remains available): %v\n", err)
				}
			}
			done := make(chan error, 1)
			go func() { done <- server.Serve(listener) }()
			select {
			case err := <-done:
				if err == http.ErrServerClosed {
					return nil
				}
				return err
			case <-ctx.Done():
				shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				return server.Shutdown(shutdown)
			}
		},
	}
	c.Flags().IntVar(&port, "port", 27484, "Local management port (independent of proxy port)")
	c.Flags().BoolVar(&dev, "dev", false, "Serve the Vite development UI with hot reload")
	c.Flags().BoolVar(&noProxy, "no-proxy", false, "Do not automatically start the proxy")
	return c
}
