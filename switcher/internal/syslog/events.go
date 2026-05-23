package syslog

import (
	"fmt"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
)

func LogCLIApplied(kind clikind.Kind, baseURL, model string, style apistyle.Style) {
	Write(
		"system",
		fmt.Sprintf(
			"[cli] applied %s base_url=%s model=%q api_style=%s",
			kind,
			strings.TrimSpace(baseURL),
			strings.TrimSpace(model),
			style,
		),
	)
}

func LogCLIReset(kind clikind.Kind) {
	Write("system", fmt.Sprintf("[cli] reset %s to default", kind))
}

func LogCLIApplyFailed(kind clikind.Kind, err error) {
	if err == nil {
		return
	}
	Write("stderr", fmt.Sprintf("[cli] apply %s failed: %v", kind, err))
}

func LogProxyStarted(host string, port int) {
	Write("stdout", fmt.Sprintf("clovapi core proxy listening on http://%s:%d", host, port))
}

func LogProxyStopped(reason string) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		reason = "shutdown"
	}
	Write("stderr", fmt.Sprintf("[proxy] stopping core (%s)", reason))
}
