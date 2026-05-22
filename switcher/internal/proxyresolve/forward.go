package proxyresolve

import (
	"errors"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/profile"
)

var ErrBindingResolutionLost = errors.New("model binding vanished after resolving route")

// ForwardRoute holds outbound connection details resolved from persisted profiles (contains secrets — never marshal/log).
type ForwardRoute struct {
	Binding        string
	IngressStyle   apistyle.Style
	EgressStyle    apistyle.Style
	EffectiveModel string
	Source         string

	APIKey         string // credential material
	BaseNormalized string // trailing-slash trimmed base URL
	UpstreamURL    string // JoinURL(BaseNormalized, pathSuffix) computed like ResolveIngressContext
}

// ResolveForwardRoute reuses IngressContext routing and attaches credentials needed for outbound HTTP calls.
func ResolveForwardRoute(store *profile.Store, providerID, modelID, ingressAPIStr string) (ForwardRoute, error) {
	ctx, err := ResolveIngressContext(store, providerID, modelID, ingressAPIStr)
	if err != nil {
		return ForwardRoute{}, err
	}
	flat, ok := store.ProfileForModelBinding(ctx.Binding)
	if !ok {
		return ForwardRoute{}, ErrBindingResolutionLost
	}
	return ForwardRoute{
		Binding:        ctx.Binding,
		IngressStyle:   ctx.IngressStyle,
		EgressStyle:    ctx.EgressStyle,
		EffectiveModel: ctx.EffectiveUpstreamModel,
		Source:         ctx.Source,
		APIKey:         strings.TrimSpace(flat.APIKey),
		BaseNormalized: NormalizeBaseURL(flat.BaseURL),
		UpstreamURL:    ctx.BaseURLJoined,
	}, nil
}
