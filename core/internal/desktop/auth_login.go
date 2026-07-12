package desktop

import (
	"context"
	"path/filepath"
	"strings"

	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/proxycontrol"
	"github.com/clovapi/switcher/internal/subscriptionauth"
)

type AuthLoginResult = subscriptionauth.LoginResult

func AuthLogin(ctx context.Context, providerID string) AuthLoginResult {
	return AuthLoginToCredential(ctx, providerID, "", nil)
}

// AuthLoginToCredential runs subscription OAuth. The core never opens a browser;
// onAuthorizeURL (when set) receives the authorize URL so the caller opens it.
func AuthLoginToCredential(ctx context.Context, providerID, credentialRef string, onAuthorizeURL func(string)) AuthLoginResult {
	wasRunning := proxycontrol.PauseIfRunning()
	defer proxycontrol.ResumeIfWasRunning(wasRunning)
	path, err := resolveAuthCredentialRef(credentialRef)
	if err != nil {
		return AuthLoginResult{OK: false, Error: err.Error()}
	}
	return subscriptionauth.LoginToPath(ctx, providerID, path, onAuthorizeURL)
}

func resolveAuthCredentialRef(ref string) (string, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return "", nil
	}
	if filepath.IsAbs(ref) {
		return ref, nil
	}
	dir, err := config.Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, ref), nil
}
