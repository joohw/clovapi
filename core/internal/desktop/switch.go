package desktop

import (
	"fmt"
	"strings"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apply"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

// ApplyProviderModel writes the local proxy ingress to the CLI and persists the
// active provider/model selection.
func ApplyProviderModel(kind agentkind.Kind, providerID, modelID string) error {
	providerID = strings.TrimSpace(providerID)
	modelID = strings.TrimSpace(modelID)
	if providerID == "" {
		return fmt.Errorf("provider id is required")
	}
	if modelID == "" {
		return fmt.Errorf("model id is required")
	}
	s, err := profile.LoadDesktop()
	if err != nil {
		return err
	}
	hit, ok := profile.FindProviderModel(s, providerID, modelID)
	if !ok {
		return fmt.Errorf("provider/model not found: %s/%s", providerID, modelID)
	}

	applyHit := hit
	ingressStyle := profile.IngressStyleForCLI(kind, applyHit)
	pathModelID, modelWire := profile.ResolveWireModelForIngress(applyHit, applyHit.Model.ID)
	port := s.Proxy.Port
	if port == 0 {
		port = 27483
	}
	baseURL := provider.BuildProxyIngressBaseURL(port, providerID)

	p := profile.Profile{
		Name:                   providerID + "/" + pathModelID,
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
	if err := EnsureCLIBackup(kind); err != nil {
		return err
	}
	if err := apply.Apply(p); err != nil {
		return err
	}

	_, err = profile.WithLockedDesktopStore(func(latest *profile.Store) (bool, error) {
		latest.SetActive(string(kind), providerID, pathModelID)
		profile.RemoveLocalProxyStubs(latest)
		return true, nil
	})
	return err
}

// ApplyBinding is deprecated compatibility for old --binding callers.
func ApplyBinding(kind agentkind.Kind, binding string) error {
	s, err := profile.LoadDesktop()
	if err != nil {
		return err
	}
	sel, ok := s.ActiveSelectionFromLegacyValue(binding)
	if !ok {
		return fmt.Errorf("invalid binding: %s", binding)
	}
	return ApplyProviderModel(kind, sel.ProviderID, sel.ModelID)
}
