package profile

import (
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

// EffectiveCurrent returns one fallback profile for compatibility when the
// store contains exactly one saved profile.
func (s *Store) EffectiveCurrent() (Profile, bool) {
	if s == nil {
		return Profile{}, false
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

// FlatProfileForProviderModel resolves a provider/model pair into a flat
// Profile suitable for proxy forwarding.
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
