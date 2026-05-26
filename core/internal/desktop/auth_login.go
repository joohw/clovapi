package desktop

import (
	"context"

	"github.com/clovapi/switcher/internal/subscriptionauth"
)

type AuthLoginResult = subscriptionauth.LoginResult

func AuthLogin(ctx context.Context, providerID string) AuthLoginResult {
	return subscriptionauth.Login(ctx, providerID, true)
}
