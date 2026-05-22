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

	ClaudeCodeVendorName = "Claude Code 订阅"
	CodexVendorName      = "Codex 订阅"
	OllamaVendorName     = "Ollama"
	CustomAPIVendorName  = "自定义 API"
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

func BuildProxyIngressBaseURL(port int, providerID, modelID, apiStyle string) string {
	if port == 0 {
		port = 27483
	}
	return "http://127.0.0.1:" + strconv.Itoa(port) + "/" + strings.TrimSpace(providerID) + "/" + url.PathEscape(strings.TrimSpace(modelID)) + "/" + strings.ToLower(strings.TrimSpace(apiStyle))
}

// ModelBindingForProvider builds the persisted @model: vendor / wire id path token used by the desktop resolver.
func ModelBindingForProvider(providerID, modelID string) string {
	def := DefinitionByID(providerID)
	if def.ID == "" {
		return ""
	}
	vn := strings.TrimSpace(def.VendorName)
	mid := strings.TrimSpace(modelID)
	if vn == "" || mid == "" {
		return ""
	}
	return "@model:" + vn + "/" + mid
}

func ParseProxyIngressPath(pathname string) (Ingress, bool) {
	parts := strings.Split(strings.TrimPrefix(pathname, "/"), "/")
	if len(parts) < 4 || strings.ToLower(parts[3]) != "v1" {
		return Ingress{}, false
	}
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
	if !IsFixedProviderID(providerID) || strings.TrimSpace(modelID) == "" || strings.TrimSpace(apiStyle) == "" {
		return Ingress{}, false
	}
	pathSuffix := "/"
	if len(parts) > 4 {
		pathSuffix = "/" + strings.Join(parts[4:], "/")
	}
	return Ingress{ProviderID: providerID, ModelID: modelID, APIStyle: strings.ToLower(apiStyle), PathSuffix: pathSuffix}, true
}
