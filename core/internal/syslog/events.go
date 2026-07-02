package syslog

import (
	"fmt"
	"strings"
)

func LogProxyStarted(host string, port int) {
	Write("stdout", fmt.Sprintf("proxy listen %s:%d", strings.TrimSpace(host), port))
}

func LogProxyStopped(reason string) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		reason = "shutdown"
	}
	Write("stderr", fmt.Sprintf("proxy stop %s", reason))
}

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
