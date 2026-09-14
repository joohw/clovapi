package sharing

import (
	"encoding/json"
	"errors"
	"regexp"
	"sort"
	"strings"

	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/relaywire"
)

type localRoute struct {
	store      *profile.Store
	providerID string
	profile    string
}

// Inventory exposes model identifiers only. The routing map and its credentials
// stay private to this process and are never serialized or sent to the platform.
type Inventory struct {
	Models []string `json:"models"`
	routes map[string]*localRoute
}

func advertisedModel(m profile.Model) string {
	id := strings.TrimSpace(m.ID)
	if id == "" || strings.EqualFold(id, "default") {
		id = strings.TrimSpace(m.Model)
	}
	return id
}

var sharedModelIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,159}$`)

func validModelID(id string) bool { return sharedModelIDPattern.MatchString(id) }

func loadSharedProfiles() (*profile.Store, error) {
	// Coordinate readers with the profile writer's cross-process lock. On
	// Windows an open profiles.json read handle otherwise blocks Save's rename.
	return profile.WithLockedStore(func(*profile.Store) (bool, error) { return false, nil })
}

// Discover uses saved models, without contacting any upstream to guess models
// or rewriting the user's profiles. Saved order resolves duplicate aliases.
func Discover() (*Inventory, error) {
	s, err := loadSharedProfiles()
	if err != nil {
		return nil, errors.New("could not read local API profiles")
	}
	inventory := &Inventory{Models: []string{}, routes: map[string]*localRoute{}}
	explicitSubscriptions := map[string]bool{}
	for _, account := range s.Subscriptions {
		explicitSubscriptions[account.ProviderID] = true
	}
	add := func(vendor profile.Profile, model profile.Model, backendID string) {
		id := advertisedModel(model)
		if !validModelID(id) || inventory.routes[id] != nil {
			return
		}
		for _, preference := range s.RouteBackends {
			if preference.ID == backendID && preference.Enabled != nil && !*preference.Enabled {
				return
			}
		}
		store, providerID, err := isolateProfile(vendor, model, id)
		if err != nil {
			return
		}
		inventory.routes[id] = &localRoute{store: store, providerID: providerID, profile: vendor.Name}
		inventory.Models = append(inventory.Models, id)
	}
	for _, vendor := range s.List {
		if strings.HasPrefix(vendor.Name, "__local_proxy_") {
			continue
		}
		if vendor.Kind == "subscription" && explicitSubscriptions[profile.ProviderIDFromStoreProfile(vendor)] {
			continue
		}
		models := vendor.Models
		if len(models) == 0 && strings.TrimSpace(vendor.Model) != "" {
			models = []profile.Model{{ID: vendor.Model, Model: vendor.Model, APIStyle: vendor.APIStyle}}
		}
		kind := strings.ToLower(strings.TrimSpace(vendor.Kind))
		providerID := profile.ProviderIDFromStoreProfile(vendor)
		if kind != "subscription" && kind != "local" {
			kind, providerID = "api", "custom-api"
		}
		for _, model := range models {
			add(vendor, model, profile.DerivedRouteBackendID(kind, vendor.Name, providerID, model.ID))
		}
	}
	for _, account := range s.Subscriptions {
		// Resolve each account independently so credentials cannot come from a
		// different signed-in account with the same provider/model.
		accountStore := &profile.Store{Version: profile.StoreVersion, Subscriptions: []profile.SubscriptionAccount{account}}
		for _, model := range account.Models {
			id := advertisedModel(model)
			if !validModelID(id) {
				continue
			}
			flat, ok := accountStore.FlatProfileForProviderModel(account.ProviderID, id)
			if !ok {
				continue
			}
			flat.Name = account.Label
			add(flat, profile.Model{ID: id, Model: flat.Model, APIStyle: flat.APIStyle}, profile.DerivedRouteBackendID("subscription", account.ID, account.ProviderID, model.ID))
		}
	}
	sort.Strings(inventory.Models)
	if len(inventory.Models) > 256 {
		for _, id := range inventory.Models[256:] {
			delete(inventory.routes, id)
		}
		inventory.Models = inventory.Models[:256]
	}
	return inventory, nil
}

func (i *Inventory) forJob(state State, job Job) (State, error) {
	var body struct {
		Model string `json:"model"`
	}
	if len(job.Body) > relaywire.MaxRequestBytes || json.Unmarshal(job.Body, &body) != nil || body.Model == "" {
		return state, errors.New("invalid task model")
	}
	route := i.routes[body.Model]
	if route == nil {
		return state, errors.New("task model is not available locally")
	}
	state.Profile, state.Model, state.route = route.profile, body.Model, route
	return state, nil
}
