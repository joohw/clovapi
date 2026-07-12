package subscriptionauth

import (
	"strings"

	"github.com/clovapi/switcher/internal/syslog"
)

func logAuthEvent(providerID, format string, args ...any) {
	provider := strings.TrimSpace(providerID)
	if provider == "" {
		provider = "subscription"
	}
	syslog.Writef("system", "auth %s: "+format, append([]any{provider}, args...)...)
}

func logAuthError(providerID, format string, args ...any) {
	provider := strings.TrimSpace(providerID)
	if provider == "" {
		provider = "subscription"
	}
	syslog.Writef("stderr", "auth %s: "+format, append([]any{provider}, args...)...)
}

func logAuthFailure(providerID, stage string, err error) {
	if err == nil {
		return
	}
	logAuthError(providerID, "%s failed: %v", stage, err)
}

func logAuthSuccess(providerID, stage string, detail string) {
	msg := stage + " ok"
	if detail = strings.TrimSpace(detail); detail != "" {
		msg += " (" + detail + ")"
	}
	logAuthEvent(providerID, "%s", msg)
}
