package cliswitch

import (
	"errors"
	"strings"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/apply"
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
		return vendorName, modelID, "", true
	}
	return arg, "", "", true
}

// VendorsForCLI lists user vendors that have at least one model usable by kind.
func VendorsForCLI(s *profile.Store, kind agentkind.Kind) []profile.Profile {
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

func subscriptionVendorAllowsManualModel(kind agentkind.Kind, vendor profile.Profile) bool {
	if strings.ToLower(strings.TrimSpace(vendor.Kind)) != "subscription" {
		return false
	}
	return VendorCompatibleWithCLI(kind, vendor)
}

// VendorCompatibleWithCLI reports whether a vendor may be used with the CLI at all.
func VendorCompatibleWithCLI(kind agentkind.Kind, vendor profile.Profile) bool {
	providerID := profile.ProviderIDFromStoreProfile(vendor)
	if providerID == "" {
		return false
	}
	switch kind {
	case agentkind.ClaudeCode, agentkind.KimiCode:
		if providerID == provider.ClaudeCodeProviderID {
			return true
		}
	case agentkind.Codex:
		if providerID == provider.CodexProviderID || providerID == provider.ClaudeCodeProviderID {
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
func CompatibleModelsForCLI(kind agentkind.Kind, vendor profile.Profile) []profile.Model {
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
func ModelCompatibleWithCLI(kind agentkind.Kind, vendor profile.Profile, model profile.Model) bool {
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
	case agentkind.ClaudeCode, agentkind.KimiCode:
		return modelStyle == apistyle.Claude || modelStyle == ""
	case agentkind.Codex:
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

// ResolveSelection resolves a vendor/model pair to provider/model identity,
// validating agent compatibility.
func ResolveSelection(s *profile.Store, kind agentkind.Kind, vendorName, modelID string) (profile.ActiveSelection, error) {
	vendorName = strings.TrimSpace(vendorName)
	modelID = strings.TrimSpace(modelID)
	if vendorName == "" {
		return profile.ActiveSelection{}, ErrVendorRequired
	}
	if modelID == "" {
		return profile.ActiveSelection{}, ErrModelRequired
	}
	vendor, ok := profile.FindStoreVendorProfile(s, vendorName)
	if !ok {
		return profile.ActiveSelection{}, ErrVendorNotFound
	}
	if !VendorCompatibleWithCLI(kind, vendor) {
		return profile.ActiveSelection{}, ErrVendorIncompatible
	}
	hit, ok := profile.FindVendorModel(s, vendorName, modelID)
	if !ok {
		return profile.ActiveSelection{}, ErrModelNotFound
	}
	if !ModelCompatibleWithCLI(kind, hit.Vendor, hit.Model) {
		return profile.ActiveSelection{}, ErrModelIncompatible
	}
	providerID := profile.ProviderIDFromStoreProfile(hit.Vendor)
	if providerID == "" {
		return profile.ActiveSelection{}, ErrVendorNotFound
	}
	return profile.ActiveSelection{ProviderID: providerID, ModelID: strings.TrimSpace(hit.Model.ID)}, nil
}

// ResolveBinding is deprecated compatibility for old --binding tests/callers.
func ResolveBinding(s *profile.Store, kind agentkind.Kind, vendorName, modelID string) (string, error) {
	sel, err := ResolveSelection(s, kind, vendorName, modelID)
	if err != nil {
		return "", err
	}
	def := provider.DefinitionByID(sel.ProviderID)
	if def.VendorName == "" {
		return "", ErrVendorNotFound
	}
	return profile.ModelBindingPrefix + def.VendorName + "/" + sel.ModelID, nil
}
