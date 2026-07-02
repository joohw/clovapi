package proxy

import (
	"net"
	"net/http"
	"time"
)

func defaultUpstreamHTTPClient() *http.Client {
	return &http.Client{
		// Do not set Timeout: it applies to the full round trip including long SSE bodies.
		Transport: &http.Transport{
			// Upstream provider calls must bypass HTTP(S)_PROXY. Local clients often
			// route through the local clovapi proxy via env vars; looping provider
			// traffic back through localhost commonly fails with EOF/reset errors.
			Proxy: nil,
			DialContext: (&net.Dialer{
				Timeout:   30 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
			ForceAttemptHTTP2:     true,
			DisableCompression:    true,
			ResponseHeaderTimeout: 10 * time.Minute,
		},
	}
}
