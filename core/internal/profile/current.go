package profile

import (
	"sort"
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
	flats := s.FlatProfilesForProviderModel(providerID, modelID)
	if len(flats) == 0 {
		return Profile{}, false
	}
	return flats[0], true
}

// FlatProfilesForProviderModel resolves all matching provider/model candidates
// into flat Profiles suitable for proxy forwarding, ordered by route backend
// priority.
func (s *Store) FlatProfilesForProviderModel(providerID, modelID string) []Profile {
	if s == nil {
		return nil
	}
	var out []Profile
	providerID = strings.TrimSpace(providerID)
	modelID = strings.TrimSpace(modelID)
	if providerID == "" || modelID == "" {
		return nil
	}
	subscriptionProviders := s.explicitSubscriptionProviders()
	for _, vendor := range s.List {
		if ProviderIDFromStoreProfile(vendor) != providerID {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(vendor.Kind), "subscription") && subscriptionProviders[providerID] {
			continue
		}
		for i, raw := range vendor.Models {
			m := NormalizeModelEntry(raw, i)
			if !modelEntryMatches(m, modelID) && !(strings.EqualFold(modelID, "default") && i == 0) {
				continue
			}
			if p, ok := flattenRouteProfile(s, vendor, m, providerID, routeSourceIDForVendor(vendor)); ok {
				out = append(out, p)
			}
		}
		if len(vendor.Models) == 0 && strings.TrimSpace(vendor.Model) != "" && strings.EqualFold(modelID, "default") {
			m := NormalizeModelEntry(Model{
				ID:       "default",
				Label:    strings.TrimSpace(vendor.Model),
				Model:    strings.TrimSpace(vendor.Model),
				APIStyle: vendor.APIStyle,
			}, 0)
			if p, ok := flattenRouteProfile(s, vendor, m, providerID, routeSourceIDForVendor(vendor)); ok {
				out = append(out, p)
			}
		}
	}
	for _, raw := range s.Subscriptions {
		acc := normalizeSubscriptionAccount(raw)
		if strings.TrimSpace(acc.ProviderID) != providerID {
			continue
		}
		for i, rawModel := range acc.Models {
			m := NormalizeModelEntry(rawModel, i)
			if !modelEntryMatches(m, modelID) && !(strings.EqualFold(modelID, "default") && i == 0) {
				continue
			}
			vendor := Profile{
				Name:                   acc.Label,
				Kind:                   "subscription",
				SubscriptionProviderID: acc.ProviderID,
				ModelAdapter:           "subscription",
				APIStyle:               subscriptionAPIStyleForProvider(acc.ProviderID),
			}
			p := flattenRouteProfileUnchecked(vendor, m, providerID, acc.ID)
			p.RouteSourceID = acc.ID
			p.RouteSourceLabel = acc.Label
			HydrateSubscriptionAccountCredentials(&p, acc)
			if strings.TrimSpace(p.BaseURL) != "" && strings.TrimSpace(p.APIKey) != "" {
				out = append(out, p)
			}
		}
	}
	sortFlatProfilesByRoutePreference(s, out)
	return out
}

func modelEntryMatches(m Model, modelID string) bool {
	id := strings.TrimSpace(modelID)
	return strings.EqualFold(strings.TrimSpace(m.ID), id) || strings.EqualFold(strings.TrimSpace(m.Model), id)
}

func routeSourceIDForVendor(vendor Profile) string {
	if strings.EqualFold(strings.TrimSpace(vendor.Kind), "subscription") {
		if acc, ok := defaultSubscriptionAccount(vendor.SubscriptionProviderID); ok {
			return acc.ID
		}
	}
	return strings.TrimSpace(vendor.Name)
}

func flattenRouteProfile(s *Store, vendor Profile, m Model, providerID string, sourceID string) (Profile, bool) {
	p := flattenRouteProfileUnchecked(vendor, m, providerID, sourceID)
	HydrateSubscriptionCredentials(&p)
	return p, strings.TrimSpace(p.BaseURL) != "" && p.APIStyle != ""
}

func flattenRouteProfileUnchecked(vendor Profile, m Model, providerID string, sourceID string) Profile {
	sourceType := strings.ToLower(strings.TrimSpace(vendor.Kind))
	if sourceType == "" {
		sourceType = "api"
	}
	sourceLabel := strings.TrimSpace(vendor.Name)
	backendID := DerivedRouteBackendID(sourceType, sourceID, providerID, m.ID)
	p := vendor
	p.Name = strings.TrimSpace(providerID) + "/" + strings.TrimSpace(m.ID)
	p.Model = firstNonEmpty(m.Model, m.ID, vendor.Model)
	p.APIStyle = firstStyle(m.APIStyle, vendor.APIStyle)
	p.BaseURL = firstNonEmpty(m.BaseURL, vendor.BaseURL)
	p.APIKey = firstNonEmpty(m.APIKey, vendor.APIKey)
	p.Models = nil
	p.RouteBackendID = backendID
	p.RouteSourceType = sourceType
	p.RouteSourceID = strings.TrimSpace(sourceID)
	p.RouteSourceLabel = sourceLabel
	return p
}

func sortFlatProfilesByRoutePreference(s *Store, profiles []Profile) {
	sort.SliceStable(profiles, func(i, j int) bool {
		_, pi, _ := routeBackendPreference(s, profiles[i].RouteBackendID)
		_, pj, _ := routeBackendPreference(s, profiles[j].RouteBackendID)
		if pi != pj {
			return pi < pj
		}
		return profiles[i].RouteBackendID < profiles[j].RouteBackendID
	})
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
