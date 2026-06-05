package subscriptionauth

import (
	"fmt"
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

func logAuthFailure(providerID, stage string, err error) {
	if err == nil {
		return
	}
	logAuthEvent(providerID, "%s failed: %v", stage, err)
}

func logAuthSuccess(providerID, stage string, detail string) {
	msg := stage + " ok"
	if detail = strings.TrimSpace(detail); detail != "" {
		msg += " (" + detail + ")"
	}
	logAuthEvent(providerID, "%s", msg)
}

func callbackListenAddr(providerID string, port int, path string) string {
	return fmt.Sprintf("http://127.0.0.1:%d%s", port, path)
}
