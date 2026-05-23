package proxyresolve

import (
	"errors"
	"fmt"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/protocol"
	"github.com/clovapi/switcher/internal/provider"
)

// JoinURL mirrors electron/proxy-resolver.joinUrl — builds final upstream path prefixes.
func JoinURL(base, pathSuffix string) string {
	b := strings.TrimRight(strings.TrimSpace(base), "/")
	p := strings.TrimSpace(pathSuffix)
	if p == "" {
		p = "/"
	} else if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	if strings.HasSuffix(strings.ToLower(b), "/v1") {
		if strings.HasPrefix(p, "/v1/") {
			return b + p[3:] // strips duplicate "/v1" prefix when base already carries /v1
		}
		if p == "/v1" {
			return b
		}
		return b + p
	}
	if strings.HasPrefix(p, "/codex/") {
		return b + p
	}
	if p == "/" || p == "" {
		return b + "/v1"
	}
	if strings.HasPrefix(p, "/v1/") || p == "/v1" {
		return b + p
	}
	return b + "/v1" + p
}

var (
	// ErrSubscriptionUpstreamNotReady indicates subscription OAuth credentials are missing or expired.
	ErrSubscriptionUpstreamNotReady = errors.New("subscription credentials missing or expired")
)

// IngressContext captures normalized styles and binding upstream metadata for debugging.
type IngressContext struct {
	Binding                string         `json:"binding"`
	IngressStyle           apistyle.Style `json:"ingress_style,omitempty"`
	EgressStyle            apistyle.Style `json:"egress_style,omitempty"`
	PathSuffix             string         `json:"path_suffix"`  // upstream suffix after gateway adds /v1 (e.g. /messages)
	BaseURLJoined          string         `json:"upstream_url"` // canonical URL JoinURL(normalized_base, suffix)
	Source                 string         `json:"source,omitempty"`
	EffectiveUpstreamModel string         `json:"upstream_model"` // upstream wire model
	AuthSummary            AuthSummary    `json:"auth"`           // scheme only — never emits secrets.
}

type AuthSummary struct {
	Scheme string `json:"scheme"` // bearer|anthropic_api_key|anthropic_oauth_headers|responses_codex_headers|generic
}

// LooksLikeClaudeOAuthToken mirrors electron/claude-backend isClaudeOAuthToken without logging the secret.
func LooksLikeClaudeOAuthToken(apiKey string) bool {
	return strings.Contains(strings.TrimSpace(apiKey), "sk-ant-oat")
}

func authScheme(style apistyle.Style, apiKey, source, accountID string) AuthSummary {
	switch style {
	case apistyle.Claude:
		if LooksLikeClaudeOAuthToken(apiKey) {
			return AuthSummary{Scheme: "anthropic_oauth_headers"}
		}
		return AuthSummary{Scheme: "anthropic_api_key"}
	case apistyle.OpenAIResponses:
		if strings.TrimSpace(source) == "subscription:codex" {
			if strings.TrimSpace(accountID) != "" {
				return AuthSummary{Scheme: "responses_codex_subscription_headers"}
			}
			return AuthSummary{Scheme: "responses_codex_subscription_headers_incomplete"}
		}
		return AuthSummary{Scheme: "responses_codex_headers"}
	default:
		if strings.TrimSpace(apiKey) == "" {
			return AuthSummary{Scheme: "none"}
		}
		return AuthSummary{Scheme: "bearer"}
	}
}

// ResolveIngressContext maps proxy route tuples + persisted store into an upstream debugging context.
//
// Errors never include API credentials; BaseURLJoined only composes sanitized base + pathSuffix.
func ResolveIngressContext(store *profile.Store, providerID, modelID, ingressAPIStr string, pathSuffixHints ...string) (IngressContext, error) {
	out := IngressContext{}
	if store == nil {
		return out, fmt.Errorf("store unavailable")
	}
	if !provider.IsFixedProviderID(providerID) {
		return out, fmt.Errorf("unsupported provider id")
	}
	binding := provider.ModelBindingForProvider(providerID, modelID)
	if strings.TrimSpace(binding) == "" {
		return out, fmt.Errorf("could not derive model binding for provider")
	}

	ingress, err := apistyle.Parse(ingressAPIStr)
	if err != nil {
		return out, err
	}

	flat, ok := store.ProfileForModelBinding(binding)
	if !ok {
		return out, fmt.Errorf("model binding not resolved in profiles store")
	}
	kind := strings.ToLower(strings.TrimSpace(flat.Kind))
	if kind == "subscription" {
		base := strings.TrimSpace(flat.BaseURL)
		key := strings.TrimSpace(flat.APIKey)
		if base == "" || key == "" {
			return out, ErrSubscriptionUpstreamNotReady
		}
		if strings.TrimSpace(flat.SubscriptionProviderID) == provider.CodexProviderID &&
			strings.TrimSpace(flat.AccountID) == "" {
			return out, ErrSubscriptionUpstreamNotReady
		}
	}

	effModel := strings.TrimSpace(flat.Model)
	if effModel == "" {
		return out, fmt.Errorf("upstream model missing after resolving binding")
	}
	baseNorm := NormalizeBaseURL(flat.BaseURL)
	egress := flat.APIStyle

	src := sourceFromProfile(&flat)
	pathSuffix := protocol.DefaultUpstreamPathSuffix(egress, src)
	if len(pathSuffixHints) > 0 && strings.TrimSpace(pathSuffixHints[0]) != "" {
		pathSuffix = pathSuffixHints[0]
	}

	out = IngressContext{
		Binding:                binding,
		IngressStyle:           ingress,
		EgressStyle:            egress,
		PathSuffix:             pathSuffix,
		BaseURLJoined:          JoinURL(baseNorm, pathSuffix),
		Source:                 src,
		EffectiveUpstreamModel: effModel,
		AuthSummary:            authScheme(egress, flat.APIKey, src, flat.AccountID),
	}
	return out, nil
}

func sourceFromProfile(p *profile.Profile) string {
	if p == nil {
		return ""
	}
	k := strings.ToLower(strings.TrimSpace(p.Kind))
	sp := strings.TrimSpace(p.SubscriptionProviderID)
	lp := strings.TrimSpace(strings.ToLower(p.LocalProvider))
	name := strings.TrimSpace(p.Name)
	switch {
	case k == "subscription" && sp != "":
		return "subscription:" + sp
	case k == "local" && lp != "":
		return "local:" + lp
	case strings.HasPrefix(name, "@model:"):
		return "binding"
	default:
		return "profile:" + name
	}
}

// NormalizeBaseURL trims slashes like electron normalizeBaseUrl.
func NormalizeBaseURL(u string) string {
	return strings.TrimRight(strings.TrimSpace(u), "/")
}
