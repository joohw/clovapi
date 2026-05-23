package desktop

import (
	"fmt"
	"strings"

	"github.com/clovapi/switcher/internal/apply"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

// ApplyBinding resolves a @model binding, writes the local proxy ingress to the CLI, and persists active.
func ApplyBinding(kind clikind.Kind, binding string) error {
	binding = strings.TrimSpace(binding)
	if binding == "" {
		return fmt.Errorf("binding is required")
	}
	if !strings.HasPrefix(binding, profile.ModelBindingPrefix) {
		return fmt.Errorf("binding must start with %q", profile.ModelBindingPrefix)
	}

	s, err := profile.LoadDesktop()
	if err != nil {
		return err
	}

	vendorName, modelID, ok := profile.ParseModelBinding(binding)
	if !ok {
		return fmt.Errorf("invalid binding: %s", binding)
	}
	hit, ok := profile.FindVendorModel(s, vendorName, modelID)
	if !ok && strings.EqualFold(strings.TrimSpace(modelID), "default") {
		vendor, vok := profile.FindStoreVendorProfile(s, vendorName)
		if vok && len(vendor.Models) > 0 {
			hit = profile.VendorModelHit{Vendor: vendor, Model: vendor.Models[0]}
			ok = true
		}
	}
	if !ok {
		return fmt.Errorf("model binding not found: %s", binding)
	}

	providerID := profile.ProviderIDFromStoreProfile(hit.Vendor)
	if !provider.IsFixedProviderID(providerID) {
		return fmt.Errorf("unsupported vendor: %s", vendorName)
	}

	applyHit := hit
	if kind == clikind.Hermes && len(hit.Vendor.Models) > 0 {
		applyHit = profile.VendorModelHit{Vendor: hit.Vendor, Model: hit.Vendor.Models[0]}
	}
	ingressStyle := profile.IngressStyleForCLI(kind, applyHit)
	pathModelID, modelWire := profile.ResolveWireModelForIngress(applyHit, applyHit.Model.ID)
	port := s.Proxy.Port
	if port == 0 {
		port = 27483
	}
	baseURL := provider.BuildProxyIngressBaseURL(port, providerID, pathModelID, string(ingressStyle))

	p := profile.Profile{
		Name:                   binding,
		CLI:                    kind,
		Kind:                   hit.Vendor.Kind,
		SubscriptionProviderID: hit.Vendor.SubscriptionProviderID,
		BaseURL:                baseURL,
		APIKey:                 "clovapi-local",
		Model:                  modelWire,
		Models:                 hit.Vendor.Models,
		APIStyle:               ingressStyle,
	}
	if !apply.KindSupportsStyle(kind, p.APIStyle) {
		return fmt.Errorf("cli %q does not support api_style %q", kind, p.APIStyle)
	}
	if err := apply.Apply(p); err != nil {
		return err
	}

	s.SetActive(string(kind), binding)
	profile.RemoveLocalProxyStubs(s)
	return profile.SaveDesktop(s)
}
