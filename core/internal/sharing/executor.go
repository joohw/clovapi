package sharing

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/proxy"
	"github.com/clovapi/switcher/internal/relaywire"
)

// pinnedProfile builds an isolated store containing only the explicitly chosen
// upstream. Global route fallback can never select another contributor profile.
func pinnedProfile(name, model string) (*profile.Store, string, error) {
	s, err := loadSharedProfiles()
	if err != nil {
		return nil, "", err
	}
	var selected *profile.Profile
	for _, p := range s.List {
		if p.Name == name {
			copy := p
			selected = &copy
			break
		}
	}
	// Subscription views are synthesized by the browser-oriented profile loader;
	// regular `clovapi add --name ...` profiles must retain their saved names.
	if selected == nil {
		normalized := profile.NormalizeDesktopStore(s)
		for _, p := range normalized.List {
			if p.Name == name {
				copy := p
				selected = &copy
				break
			}
		}
	}
	if selected == nil {
		return nil, "", errors.New("selected local profile does not exist; use clovapi list")
	}
	var candidate *profile.Model
	for _, m := range selected.Models {
		if m.ID == model || m.Model == model {
			copy := m
			candidate = &copy
			break
		}
	}
	if candidate == nil && selected.Model == model {
		candidate = &profile.Model{ID: model, Model: model, APIStyle: selected.APIStyle}
	}
	if candidate == nil {
		return nil, "", errors.New("selected model is not configured in the local profile")
	}
	return isolateProfile(*selected, *candidate, model)
}

func isolateProfile(selected profile.Profile, candidate profile.Model, model string) (*profile.Store, string, error) {
	// The consumer sees the bound model name; the profile retains its exact
	// upstream model and credentials through the ordinary protocol resolver.
	candidate.ID = model
	if candidate.Model == "" {
		candidate.Model = model
	}
	if candidate.APIStyle == "" {
		candidate.APIStyle = selected.APIStyle
	}
	if _, err := apistyle.Parse(string(candidate.APIStyle)); err != nil {
		return nil, "", errors.New("unsupported local profile API style")
	}
	// The proxy has a fixed provider-id vocabulary. Map just this selected API
	// profile into that vocabulary without altering the saved user profile.
	if selected.Kind != "subscription" && selected.Kind != "local" {
		selected.Name = profile.CustomAPIProfileName
		selected.Kind = "api"
	}
	selected.Models = []profile.Model{candidate}
	store := &profile.Store{Version: profile.StoreVersion, List: []profile.Profile{selected}}
	providerID := profile.ProviderIDFromStoreProfile(selected)
	flat, ok := store.FlatProfileForProviderModel(providerID, model)
	if !ok || flat.BaseURL == "" || flat.APIStyle == "" {
		return nil, "", errors.New("local profile cannot resolve the selected model")
	}
	upstream, err := url.Parse(flat.BaseURL)
	if err != nil || upstream.Host == "" || (upstream.Scheme != "http" && upstream.Scheme != "https") {
		return nil, "", errors.New("invalid local upstream URL")
	}
	if strings.TrimSpace(flat.APIKey) == "" && !strings.EqualFold(flat.Kind, "local") {
		return nil, "", errors.New("selected local profile has no upstream credential")
	}
	if _, err = apistyle.Parse(string(flat.APIStyle)); err != nil {
		return nil, "", errors.New("unsupported local profile API style")
	}
	return store, providerID, nil
}

func ValidateProfile(name, model string) error { _, _, err := pinnedProfile(name, model); return err }

type ExecuteFunc func(context.Context, State, Job, http.ResponseWriter) error

func Execute(ctx context.Context, state State, job Job, w http.ResponseWriter) error {
	body, err := validatedBody(state, job)
	if err != nil {
		return err
	}
	var store *profile.Store
	var providerID string
	if state.route != nil {
		store, providerID = state.route.store, state.route.providerID
	} else {
		store, providerID, err = pinnedProfile(state.Profile, state.Model)
		if err != nil {
			return err
		}
	}
	server := proxy.NewServer(profile.ProxyConfig{Host: "127.0.0.1"})
	defer server.HTTPClient.CloseIdleConnections()
	// Shared requests are transported through this handler in-process. No HTTP
	// listener or management/debug endpoint is exposed, and prompts are not logged.
	if server.CallLogs != nil {
		server.CallLogs.Close()
		server.CallLogs = nil
	}
	server.ProfileLoader = func() (*profile.Store, error) { return store, nil }
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://node.local/"+providerID+job.Path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	server.Server.Handler.ServeHTTP(w, req)
	return ctx.Err()
}

func validatedBody(state State, job Job) ([]byte, error) {
	if job.Path != "/v1/chat/completions" && job.Path != "/v1/responses" {
		return nil, errors.New("task endpoint is not allowed")
	}
	if len(job.Body) > relaywire.MaxRequestBytes {
		return nil, errors.New("task body is too large")
	}
	var body map[string]json.RawMessage
	if err := json.Unmarshal(job.Body, &body); err != nil || body == nil {
		return nil, errors.New("invalid task JSON object")
	}
	var model string
	if err := json.Unmarshal(body["model"], &model); err != nil || model != state.Model {
		return nil, errors.New("task model differs from the local binding")
	}
	// No URL, method, headers or authentication supplied by a consumer is used
	// for transport. Only these two API bodies enter the isolated model handler.
	return job.Body, nil
}
