package desktop

import (
	"context"

	"github.com/clovapi/switcher/internal/proxycontrol"
	"github.com/clovapi/switcher/internal/subscriptionauth"
)

type AuthLoginResult = subscriptionauth.LoginResult

func AuthLogin(ctx context.Context, providerID string) AuthLoginResult {
	wasRunning := proxycontrol.PauseIfRunning()
	defer proxycontrol.ResumeIfWasRunning(wasRunning)
	return subscriptionauth.Login(ctx, providerID, true)
}
