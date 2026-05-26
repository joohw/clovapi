package cliswitch

import (
	"errors"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/apply"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

var (
	ErrVendorRequired     = errors.New("vendor name is required")
	ErrModelRequired      = errors.New("model id is required")
	ErrVendorNotFound     = errors.New("vendor not found")
	ErrModelNotFound      = errors.New("model not found")
	ErrVendorIncompatible = errors.New("vendor is not compatible with this CLI")
	ErrModelIncompatible  = errors.New("model is not compatible with this CLI")
)

// BuildModelBinding returns a persisted @model:Vendor/model-id binding.
func BuildModelBinding(vendorName, modelID string) string {
	vendorName = strings.TrimSpace(vendorName)
	modelID = strings.TrimSpace(modelID)
	if vendorName == "" || modelID == "" {
		return ""
	}
	return profile.ModelBindingPrefix + vendorName + "/" + modelID
}

// ParseTarget parses switch positional args: @model:…, Vendor/model, or vendor-only.
func ParseTarget(arg string) (vendorName, modelID, binding string, ok bool) {
	arg = strings.TrimSpace(arg)
	if arg == "" {
		return "", "", "", false
	}
	if strings.HasPrefix(arg, profile.ModelBindingPrefix) {
		v, m, parsed := profile.ParseModelBinding(arg)
		if !parsed {
			return "", "", "", false
		}
		return v, m, arg, true
	}
	if slash := strings.Index(arg, "/"); slash > 0 && slash < len(arg)-1 {
		vendorName = arg[:slash]
		modelID = arg[slash+1:]
		return vendorName, modelID, BuildModelBinding(vendorName, modelID), true
	}
	return arg, "", "", true
}

// VendorsForCLI lists user vendors that have at least one model usable by kind.
func VendorsForCLI(s *profile.Store, kind clikind.Kind) []profile.Profile {
	if s == nil {
		return nil
	}
	var out []profile.Profile
	seen := map[string]bool{}
	for _, p := range s.List {
		if !profile.IsAllowedUserVendorProfile(p) {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(p.Name))
		if seen[key] {
			continue
		}
		if !VendorCompatibleWithCLI(kind, p) {
			continue
		}
		if len(CompatibleModelsForCLI(kind, p)) == 0 && !subscriptionVendorAllowsManualModel(kind, p) {
			continue
		}
		seen[key] = true
		out = append(out, p)
	}
	return out
}

func subscriptionVendorAllowsManualModel(kind clikind.Kind, vendor profile.Profile) bool {
	if strings.ToLower(strings.TrimSpace(vendor.Kind)) != "subscription" {
		return false
	}
	return VendorCompatibleWithCLI(kind, vendor)
}

// VendorCompatibleWithCLI reports whether a vendor may be used with the CLI at all.
func VendorCompatibleWithCLI(kind clikind.Kind, vendor profile.Profile) bool {
	providerID := profile.ProviderIDFromStoreProfile(vendor)
	if providerID == "" {
		return false
	}
	switch kind {
	case clikind.ClaudeCode, clikind.KimiCode:
		if providerID == provider.ClaudeCodeProviderID {
			return true
		}
	case clikind.Codex:
		if providerID == provider.CodexProviderID {
			return true
		}
	default:
		if providerID == provider.ClaudeCodeProviderID || providerID == provider.CodexProviderID {
			return true
		}
	}
	if providerID == provider.OllamaProviderID || providerID == provider.CustomAPIProviderID {
		return len(CompatibleModelsForCLI(kind, vendor)) > 0
	}
	return false
}

// CompatibleModelsForCLI lists vendor models whose ingress style works with kind.
func CompatibleModelsForCLI(kind clikind.Kind, vendor profile.Profile) []profile.Model {
	var out []profile.Model
	for i, raw := range vendor.Models {
		m := profile.NormalizeModelEntry(raw, i)
		if ModelCompatibleWithCLI(kind, vendor, m) {
			out = append(out, m)
		}
	}
	return out
}

// ModelCompatibleWithCLI reports whether vendor/model can be applied to kind.
func ModelCompatibleWithCLI(kind clikind.Kind, vendor profile.Profile, model profile.Model) bool {
	if !VendorCompatibleWithCLI(kind, vendor) {
		return false
	}
	hit := profile.VendorModelHit{Vendor: vendor, Model: model}
	ingress := profile.IngressStyleForCLI(kind, hit)
	if !apply.KindSupportsStyle(kind, ingress) {
		return false
	}
	providerID := profile.ProviderIDFromStoreProfile(vendor)
	if providerID == provider.ClaudeCodeProviderID || providerID == provider.CodexProviderID {
		return true
	}
	modelStyle := modelStyleOrDefault(model, vendor)
	switch kind {
	case clikind.ClaudeCode, clikind.KimiCode:
		return modelStyle == apistyle.Claude || modelStyle == ""
	case clikind.Codex:
		return modelStyle == apistyle.OpenAIResponses || modelStyle == apistyle.OpenAIChat || modelStyle == ""
	default:
		return true
	}
}

func modelStyleOrDefault(model profile.Model, vendor profile.Profile) apistyle.Style {
	if strings.TrimSpace(string(model.APIStyle)) != "" {
		return model.APIStyle
	}
	return vendor.APIStyle
}

// ResolveBinding resolves a vendor/model pair to a binding, validating CLI compatibility.
func ResolveBinding(s *profile.Store, kind clikind.Kind, vendorName, modelID string) (string, error) {
	vendorName = strings.TrimSpace(vendorName)
	modelID = strings.TrimSpace(modelID)
	if vendorName == "" {
		return "", ErrVendorRequired
	}
	if modelID == "" {
		return "", ErrModelRequired
	}
	vendor, ok := profile.FindStoreVendorProfile(s, vendorName)
	if !ok {
		return "", ErrVendorNotFound
	}
	if !VendorCompatibleWithCLI(kind, vendor) {
		return "", ErrVendorIncompatible
	}
	hit, ok := profile.FindVendorModel(s, vendorName, modelID)
	if !ok {
		return "", ErrModelNotFound
	}
	if !ModelCompatibleWithCLI(kind, hit.Vendor, hit.Model) {
		return "", ErrModelIncompatible
	}
	return BuildModelBinding(vendorName, modelID), nil
}
