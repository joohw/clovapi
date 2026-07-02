package subscriptionauth

import (
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"
)

// OAuth token/profile requests must bypass HTTP(S)_PROXY. Desktop users often
// route local traffic through the clovapi proxy via env vars; sending
// auth.openai.com through that proxy commonly fails with EOF/reset errors.
var oauthHTTPClient = &http.Client{
	Timeout: 45 * time.Second,
	Transport: &http.Transport{
		Proxy: nil,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          8,
		IdleConnTimeout:       30 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	},
}

func formatOAuthHTTPError(label string, err error) error {
	if err == nil {
		return nil
	}
	msg := strings.TrimSpace(err.Error())
	lower := strings.ToLower(msg)
	if strings.Contains(lower, "eof") || strings.Contains(lower, "connection reset") {
		return fmt.Errorf("%s: %w (OAuth requests bypass HTTP_PROXY; if this persists, check VPN/firewall)", label, err)
	}
	return fmt.Errorf("%s: %w", label, err)
}
