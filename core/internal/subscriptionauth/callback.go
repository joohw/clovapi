package subscriptionauth

import (
	"context"
	"fmt"
	"html"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type callbackData struct {
	Code  string
	State string
}

type callbackError struct {
	Status  int
	Message string
	Details string
}

type callbackOptions struct {
	Port     int
	Path     string
	Validate func(url.Values) (callbackData, callbackError)
}

type callbackServer struct {
	server *http.Server
	ln     net.Listener
	done   chan callbackResult
	once   sync.Once
}

type callbackResult struct {
	data callbackData
	err  error
}

func startCallbackServer(ctx context.Context, opts callbackOptions) (*callbackServer, error) {
	if opts.Port == 0 || strings.TrimSpace(opts.Path) == "" || opts.Validate == nil {
		return nil, fmt.Errorf("invalid callback server options")
	}
	cs := &callbackServer{done: make(chan callbackResult, 1)}
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != opts.Path {
			writeOAuthHTML(w, http.StatusNotFound, "error", "The callback path is incorrect.", "")
			return
		}
		data, validation := opts.Validate(r.URL.Query())
		if validation.Message != "" {
			status := validation.Status
			if status == 0 {
				status = http.StatusBadRequest
			}
			writeOAuthHTML(w, status, "error", validation.Message, validation.Details)
			return
		}
		writeOAuthHTML(w, http.StatusOK, "success", "Authorization complete. You can return to ClovAPI.", "")
		cs.complete(callbackResult{data: data})
	})
	cs.server = &http.Server{Handler: mux}

	if err := prepareCallbackPort(opts.Port); err != nil {
		return nil, err
	}
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", opts.Port))
	if err != nil {
		return nil, err
	}
	cs.ln = ln
	go func() {
		<-ctx.Done()
		cs.complete(callbackResult{err: errCallbackCancelled})
		cs.close()
	}()
	go func() {
		if err := cs.server.Serve(ln); err != nil && err != http.ErrServerClosed {
			cs.complete(callbackResult{err: err})
		}
	}()
	return cs, nil
}

func (s *callbackServer) Wait(ctx context.Context) (callbackData, error) {
	select {
	case result := <-s.done:
		return result.data, result.err
	case <-ctx.Done():
		return callbackData{}, errCallbackCancelled
	}
}

func (s *callbackServer) Close() {
	s.close()
}

func (s *callbackServer) close() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = s.server.Shutdown(ctx)
	if s.ln != nil {
		_ = s.ln.Close()
	}
}

func (s *callbackServer) complete(result callbackResult) {
	s.once.Do(func() {
		s.done <- result
	})
}

func writeOAuthHTML(w http.ResponseWriter, status int, kind, message, details string) {
	heading := "Login failed"
	if kind == "success" {
		heading = "Login successful"
	}
	detailBlock := ""
	if strings.TrimSpace(details) != "" {
		detailBlock = `<p class="details">` + html.EscapeString(details) + `</p>`
	}
	closeScript := ""
	closeHint := ""
	if kind == "success" {
		closeHint = `<p class="hint">This window will close automatically. If it stays open, you may close it manually.</p>`
		closeScript = `<script>
    window.setTimeout(function () {
      window.close();
    }, 500);
  </script>`
	}
	body := `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>` + html.EscapeString(heading) + `</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 40px auto; max-width: 480px; text-align: center; color: #111; }
    h1 { font-size: 1.25rem; }
    p { color: #444; line-height: 1.6; }
    .hint { color: #666; font-size: 0.9rem; }
    .details { font-family: monospace; font-size: 0.85rem; word-break: break-word; }
  </style>
</head>
<body>
  <h1>` + html.EscapeString(heading) + `</h1>
  <p>` + html.EscapeString(message) + `</p>
  ` + closeHint + `
  ` + detailBlock + `
  ` + closeScript + `
</body>
</html>`
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body))
}
