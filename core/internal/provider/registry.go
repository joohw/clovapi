package provider

import (
	"net/url"
	"strconv"
	"strings"
)

const (
	ClaudeCodeProviderID = "claude-code"
	CodexProviderID      = "codex"
	OllamaProviderID     = "ollama"
	CustomAPIProviderID  = "custom-api"

	ClaudeCodeVendorName = "Claude Subscription"
	CodexVendorName      = "Codex Subscription"
	OllamaVendorName     = "Ollama"
	CustomAPIVendorName  = "Custom API"
)

type Definition struct {
	ID                     string
	VendorName             string
	Kind                   string
	SubscriptionProviderID string
	LocalProvider          string
}

type Ingress struct {
	ProviderID string
	ModelID    string
	APIStyle   string
	PathSuffix string
}

var registry = []Definition{
	{ID: ClaudeCodeProviderID, VendorName: ClaudeCodeVendorName, Kind: "subscription", SubscriptionProviderID: ClaudeCodeProviderID},
	{ID: CodexProviderID, VendorName: CodexVendorName, Kind: "subscription", SubscriptionProviderID: CodexProviderID},
	{ID: OllamaProviderID, VendorName: OllamaVendorName, Kind: "local", LocalProvider: OllamaProviderID},
	{ID: CustomAPIProviderID, VendorName: CustomAPIVendorName, Kind: "api"},
}

func Registry() []Definition {
	out := make([]Definition, len(registry))
	copy(out, registry)
	return out
}

func FixedProviderIDs() []string {
	out := make([]string, 0, len(registry))
	for _, d := range registry {
		out = append(out, d.ID)
	}
	return out
}

func IsFixedProviderID(providerID string) bool {
	return DefinitionByID(providerID).ID != ""
}

func DefinitionByID(providerID string) Definition {
	id := strings.TrimSpace(providerID)
	for _, d := range registry {
		if d.ID == id {
			return d
		}
	}
	return Definition{}
}

func VendorNameFromProviderID(providerID string) string {
	return DefinitionByID(providerID).VendorName
}

func ProviderIDFromVendorName(vendorName string) string {
	name := strings.ToLower(strings.TrimSpace(vendorName))
	for _, d := range registry {
		if strings.ToLower(d.VendorName) == name {
			return d.ID
		}
	}
	return ""
}

func BuildProxyIngressBaseURL(port int, providerID string) string {
	if port == 0 {
		port = 27483
	}
	base := "http://127.0.0.1:" + strconv.Itoa(port) + "/" + strings.TrimSpace(providerID)
	return strings.TrimRight(base, "/") + "/v1"
}

func ParseProxyIngressPath(pathname string) (Ingress, bool) {
	pathname = normalizeProxyIngressPath(pathname)
	parts := strings.Split(strings.TrimPrefix(pathname, "/"), "/")
	if len(parts) >= 4 && strings.ToLower(parts[3]) == "v1" {
		return parseLegacyProxyIngressParts(parts)
	}
	if len(parts) < 2 || strings.ToLower(parts[1]) != "v1" {
		return Ingress{}, false
	}
	providerID, err := url.PathUnescape(parts[0])
	if err != nil {
		return Ingress{}, false
	}
	if !IsFixedProviderID(providerID) {
		return Ingress{}, false
	}
	pathSuffix := "/"
	if len(parts) > 2 {
		pathSuffix = "/" + strings.Join(parts[2:], "/")
	}
	apiStyle := apiStyleFromPathSuffix(pathSuffix)
	if apiStyle == "" {
		return Ingress{}, false
	}
	return Ingress{ProviderID: providerID, APIStyle: apiStyle, PathSuffix: pathSuffix}, true
}

func parseLegacyProxyIngressParts(parts []string) (Ingress, bool) {
	providerID, err := url.PathUnescape(parts[0])
	if err != nil {
		return Ingress{}, false
	}
	modelID, err := url.PathUnescape(parts[1])
	if err != nil {
		return Ingress{}, false
	}
	apiStyle, err := url.PathUnescape(parts[2])
	if err != nil {
		return Ingress{}, false
	}
	pathSuffix := "/"
	if len(parts) > 4 {
		pathSuffix = "/" + strings.Join(parts[4:], "/")
	}
	if !IsFixedProviderID(providerID) || strings.TrimSpace(modelID) == "" || strings.TrimSpace(apiStyle) == "" {
		return Ingress{}, false
	}
	return Ingress{ProviderID: providerID, ModelID: modelID, APIStyle: strings.ToLower(apiStyle), PathSuffix: pathSuffix}, true
}

// normalizeProxyIngressPath collapses /v1/v1/ from Anthropic clients whose base URL already ends with /v1.
func normalizeProxyIngressPath(pathname string) string {
	for strings.Contains(pathname, "/v1/v1/") {
		pathname = strings.ReplaceAll(pathname, "/v1/v1/", "/v1/")
	}
	if strings.HasSuffix(pathname, "/v1/v1") {
		pathname = strings.TrimSuffix(pathname, "/v1")
	}
	return pathname
}

func apiStyleFromPathSuffix(pathSuffix string) string {
	p := strings.ToLower(strings.TrimSpace(pathSuffix))
	if p == "" || p == "/" {
		return ""
	}
	switch {
	case p == "/messages" || strings.HasPrefix(p, "/messages/"):
		return "claude"
	case p == "/responses" || strings.HasPrefix(p, "/responses/"):
		return "openai-responses"
	case p == "/chat/completions" || strings.HasPrefix(p, "/chat/completions/"):
		return "openai-chat"
	case strings.HasPrefix(p, "/models/") && (strings.Contains(p, ":generatecontent") || strings.Contains(p, ":streamgeneratecontent")):
		return "gemini"
	case p == "/models" || strings.HasPrefix(p, "/models/"):
		return "openai-responses"
	default:
		return ""
	}
}
