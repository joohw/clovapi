package syslog

import (
	"fmt"
	"strings"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apistyle"
)

func LogCLIApplied(kind agentkind.Kind, model string, style apistyle.Style) {
	Write(
		"system",
		fmt.Sprintf(
			"apply %s model=%s style=%s",
			kind,
			strings.TrimSpace(model),
			style,
		),
	)
}

func LogCLIReset(kind agentkind.Kind) {
	Write("system", fmt.Sprintf("reset %s", kind))
}

func LogCLIApplyFailed(kind agentkind.Kind, err error) {
	if err == nil {
		return
	}
	Write("stderr", fmt.Sprintf("apply %s failed: %v", kind, err))
}

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
