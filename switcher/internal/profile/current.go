package profile

import (
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

// EffectiveCurrent returns one fallback profile for compatibility:
// first active binding, otherwise a single saved profile.
func (s *Store) EffectiveCurrent() (Profile, bool) {
	if s == nil {
		return Profile{}, false
	}
	for _, name := range s.Active {
		if p, ok := s.Get(name); ok {
			p = normalizeStoredProfileCopy(p)
			if p.BaseURL != "" && p.APIStyle != "" {
				return p, true
			}
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
	name := strings.TrimSpace(s.Active[cli])
	if name == "" {
		return Profile{}, false
	}
	if p, ok := s.Get(name); ok {
		return p, true
	}
	if strings.HasPrefix(name, "@model:") {
		return s.ProfileForModelBinding(name)
	}
	return Profile{}, false
}

// ProfileForModelBinding resolves desktop active bindings of the form
// @model:<vendor-name>/<model-id> into a flat Profile suitable for CLI apply.
func (s *Store) ProfileForModelBinding(binding string) (Profile, bool) {
	if s == nil {
		return Profile{}, false
	}
	value := strings.TrimSpace(binding)
	if !strings.HasPrefix(value, "@model:") {
		return Profile{}, false
	}
	rest := strings.TrimPrefix(value, "@model:")
	slash := strings.Index(rest, "/")
	if slash <= 0 || slash >= len(rest)-1 {
		return Profile{}, false
	}
	vendorName := rest[:slash]
	modelID := rest[slash+1:]
	hit, ok := FindVendorModel(s, vendorName, modelID)
	if !ok {
		return Profile{}, false
	}
	vendor := hit.Vendor
	m := hit.Model
	useModelConnection := strings.EqualFold(strings.TrimSpace(vendor.Name), CustomAPIProfileName)
	p := vendor
	p.Name = binding
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
