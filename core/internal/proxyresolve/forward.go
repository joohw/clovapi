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
	ProviderID     string
	ModelID        string
	BackendID      string
	SourceType     string
	SourceID       string
	SourceLabel    string
	IngressStyle   apistyle.Style
	EgressStyle    apistyle.Style
	EffectiveModel string
	Source         string

	APIKey         string // credential material
	AccountID      string // ChatGPT account id for Codex subscription upstream
	BaseNormalized string // trailing-slash trimmed base URL
	UpstreamURL    string // JoinURL(BaseNormalized, pathSuffix) computed like ResolveIngressContext
}

// ResolveForwardRoute reuses IngressContext routing and attaches credentials needed for outbound HTTP calls.
func ResolveForwardRoute(store *profile.Store, providerID, modelID, ingressAPIStr string) (ForwardRoute, error) {
	routes, err := ResolveForwardRoutes(store, providerID, modelID, ingressAPIStr)
	if err != nil {
		return ForwardRoute{}, err
	}
	if len(routes) == 0 {
		return ForwardRoute{}, ErrBindingResolutionLost
	}
	return routes[0], nil
}

// ResolveForwardRoutes returns all matching route candidates ordered by store
// backend preference. The first route preserves ResolveForwardRoute behavior.
func ResolveForwardRoutes(store *profile.Store, providerID, modelID, ingressAPIStr string) ([]ForwardRoute, error) {
	ctx, err := ResolveIngressContext(store, providerID, modelID, ingressAPIStr)
	if err != nil {
		return nil, err
	}
	flats := store.FlatProfilesForProviderModel(ctx.ProviderID, ctx.ModelID)
	if len(flats) == 0 {
		return nil, ErrBindingResolutionLost
	}
	routes := make([]ForwardRoute, 0, len(flats))
	for _, flat := range flats {
		route, ok := forwardRouteFromFlat(ctx, flat)
		if ok {
			routes = append(routes, route)
		}
	}
	if len(routes) == 0 {
		return nil, ErrBindingResolutionLost
	}
	return routes, nil
}

func forwardRouteFromFlat(ctx IngressContext, flat profile.Profile) (ForwardRoute, bool) {
	effModel := strings.TrimSpace(flat.Model)
	if effModel == "" {
		return ForwardRoute{}, false
	}
	return ForwardRoute{
		ProviderID:     ctx.ProviderID,
		ModelID:        ctx.ModelID,
		BackendID:      strings.TrimSpace(flat.RouteBackendID),
		SourceType:     strings.TrimSpace(flat.RouteSourceType),
		SourceID:       strings.TrimSpace(flat.RouteSourceID),
		SourceLabel:    strings.TrimSpace(flat.RouteSourceLabel),
		IngressStyle:   ctx.IngressStyle,
		EgressStyle:    ctx.EgressStyle,
		EffectiveModel: effModel,
		Source:         sourceFromProfile(&flat),
		APIKey:         strings.TrimSpace(flat.APIKey),
		AccountID:      strings.TrimSpace(flat.AccountID),
		BaseNormalized: NormalizeBaseURL(flat.BaseURL),
		UpstreamURL:    JoinURL(NormalizeBaseURL(flat.BaseURL), UpstreamPathSuffix(flat.APIStyle, sourceFromProfile(&flat))),
	}, true
}
