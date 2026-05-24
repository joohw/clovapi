package syslog

import (
	"fmt"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
)

func LogCLIApplied(kind clikind.Kind, model string, style apistyle.Style) {
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

func LogCLIReset(kind clikind.Kind) {
	Write("system", fmt.Sprintf("reset %s", kind))
}

func LogCLIApplyFailed(kind clikind.Kind, err error) {
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
