package profile

import (
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

// EffectiveCurrent returns one fallback profile for compatibility:
// first active provider/model selection, otherwise a single saved profile.
func (s *Store) EffectiveCurrent() (Profile, bool) {
	if s == nil {
		return Profile{}, false
	}
	for _, sel := range s.Active {
		if p, ok := s.FlatProfileForProviderModel(sel.ProviderID, sel.ModelID); ok {
			return p, true
		}
	}
	if len(s.List) == 1 {
		p := normalizeStoredProfileCopy(s.List[0])
		if p.BaseURL != "" && p.APIStyle != "" {
			return p, true
		}
	}
	return Profile{}, false
}

func normalizeStoredProfileCopy(p Profile) Profile {
	return p
}

// ActiveForCLI resolves active profile for a CLI.
func (s *Store) ActiveForCLI(cli string) (Profile, bool) {
	if s == nil || s.Active == nil {
		return Profile{}, false
	}
	sel := s.Active[cli].normalized()
	return s.FlatProfileForProviderModel(sel.ProviderID, sel.ModelID)
}

// FlatProfileForProviderModel resolves a provider/model pair into a flat
// Profile suitable for CLI apply or proxy forwarding.
func (s *Store) FlatProfileForProviderModel(providerID, modelID string) (Profile, bool) {
	if s == nil {
		return Profile{}, false
	}
	hit, ok := FindProviderModel(s, providerID, modelID)
	if !ok {
		return Profile{}, false
	}
	vendor := hit.Vendor
	m := hit.Model
	useModelConnection := strings.EqualFold(strings.TrimSpace(vendor.Name), CustomAPIProfileName)
	p := vendor
	p.Name = strings.TrimSpace(providerID) + "/" + strings.TrimSpace(m.ID)
	p.Model = firstNonEmpty(m.Model, m.ID, vendor.Model)
	p.APIStyle = firstStyle(m.APIStyle, vendor.APIStyle)
	if useModelConnection {
		p.BaseURL = firstNonEmpty(m.BaseURL, vendor.BaseURL)
		p.APIKey = firstNonEmpty(m.APIKey, vendor.APIKey)
	} else {
		p.BaseURL = firstNonEmpty(m.BaseURL, vendor.BaseURL)
		p.APIKey = firstNonEmpty(m.APIKey, vendor.APIKey)
	}
	p.Models = nil
	HydrateSubscriptionCredentials(&p)
	return p, strings.TrimSpace(p.BaseURL) != "" && p.APIStyle != ""
}

// ProfileForModelBinding is retained for one-way migration and deprecated
// command compatibility. New code should use FlatProfileForProviderModel.
func (s *Store) ProfileForModelBinding(binding string) (Profile, bool) {
	if s == nil {
		return Profile{}, false
	}
	if sel, ok := s.activeSelectionFromLegacyValue(binding); ok {
		return s.FlatProfileForProviderModel(sel.ProviderID, sel.ModelID)
	}
	return Profile{}, false
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func firstStyle(values ...apistyle.Style) apistyle.Style {
	for _, v := range values {
		if strings.TrimSpace(string(v)) != "" {
			return v
		}
	}
	return ""
}

// FirstProfileForCLI picks the first profile dedicated to this CLI.
func (s *Store) FirstProfileForCLI(cli string) (Profile, bool) {
	if s == nil {
		return Profile{}, false
	}
	for _, p := range s.List {
		if string(p.CLI) == cli {
			return p, true
		}
	}
	return Profile{}, false
}
