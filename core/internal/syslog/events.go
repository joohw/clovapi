package syslog

import (
	"fmt"
	"strings"
)

func LogProxyProbe(method, url string, status int, detail string) {
	method = strings.TrimSpace(method)
	url = strings.TrimSpace(url)
	detail = strings.TrimSpace(detail)
	msg := fmt.Sprintf("probe %s %s -> HTTP %d", method, url, status)
	if detail != "" {
		msg += ": " + detail
	}
	Write("proxy", msg)
}
