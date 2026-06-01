package desktop

import (
	"context"

	"github.com/clovapi/switcher/internal/proxycontrol"
	"github.com/clovapi/switcher/internal/subscriptionauth"
)

type AuthLoginResult = subscriptionauth.LoginResult

func AuthLogin(ctx context.Context, providerID string) AuthLoginResult {
	// Pause local proxy so OAuth callback ports and cancel/stop flows do not race the daemon.
	_ = proxycontrol.PauseIfRunning()
	return subscriptionauth.Login(ctx, providerID, true)
}
