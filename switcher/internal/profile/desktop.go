package profile

import (
	"fmt"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/provider"
)

const (
	ModelBindingPrefix   = "@model:"
	OllamaProfileName    = "Ollama"
	CustomAPIProfileName = "Custom API"
)

var subscriptionVendorDefs = []struct {
	SubscriptionProviderID string
	Name                   string
}{
	{SubscriptionProviderID: provider.ClaudeCodeProviderID, Name: provider.ClaudeCodeVendorName},
	{SubscriptionProviderID: provider.CodexProviderID, Name: provider.CodexVendorName},
}

var allowedAPIStyles = map[string]apistyle.Style{
	"claude":           apistyle.Claude,
	"openai-chat":      apistyle.OpenAIChat,
	"openai-responses": apistyle.OpenAIResponses,
	"gemini":           apistyle.Gemini,
}

// NormalizeAPIStyle maps legacy/desktop style strings to canonical apistyle values.
func NormalizeAPIStyle(raw string) apistyle.Style {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "openai" {
		return apistyle.OpenAIResponses
	}
	if s == "anthropic" {
		return apistyle.Claude
	}
	if st, ok := allowedAPIStyles[s]; ok {
		return st
	}
	return apistyle.OpenAIResponses
}

func normalizeProfileKind(kind string) string {
	k := strings.ToLower(strings.TrimSpace(kind))
	if k == "subscription" || k == "local" {
		return k
	}
	return "api"
}

func normalizeModelAdapter(raw, vendorKind, localProvider string) string {
	kind := strings.ToLower(strings.TrimSpace(vendorKind))
	if kind == "subscription" {
		return "subscription"
	}
	id := strings.TrimSpace(raw)
	switch id {
	case "manual", "openai-compatible", "ollama", "subscription":
		return id
	}
	if kind == "local" && strings.EqualFold(strings.TrimSpace(localProvider), provider.OllamaProviderID) {
		return "ollama"
	}
	return "openai-compatible"
}

// NormalizeModelEntry returns a desktop model row with defaults filled in.
func NormalizeModelEntry(raw Model, index int) Model {
	model := strings.TrimSpace(raw.Model)
	id := strings.TrimSpace(raw.ID)
	if id == "" {
		if index == 0 {
			id = "default"
		} else {
			id = fmt.Sprintf("model-%d", index+1)
		}
	}
	label := strings.TrimSpace(raw.Label)
	if label == "" {
		label = firstNonEmpty(model, id)
	}
	if model == "" {
		model = id
	}
	return Model{
		ID:       id,
		Label:    label,
		Model:    model,
		APIStyle: NormalizeAPIStyle(string(raw.APIStyle)),
		BaseURL:  strings.TrimSpace(raw.BaseURL),
		APIKey:   strings.TrimSpace(raw.APIKey),
	}
}

func normalizeVendorModels(models []Model) []Model {
	if len(models) == 0 {
		return nil
	}
	out := make([]Model, len(models))
	for i, m := range models {
		out[i] = NormalizeModelEntry(m, i)
	}
	return out
}

// NormalizeVendorProfile normalizes one vendor profile from disk or UI input.
func NormalizeVendorProfile(p Profile, index int) Profile {
	name := strings.TrimSpace(p.Name)
	if name == "" {
		name = fmt.Sprintf("vendor-%d", index+1)
	}
	kind := normalizeProfileKind(p.Kind)
	localProvider := strings.TrimSpace(p.LocalProvider)
	models := normalizeVendorModels(p.Models)
	apiStyle := NormalizeAPIStyle(string(firstStyle(
		p.APIStyle,
		func() apistyle.Style {
			if len(models) > 0 {
				return models[0].APIStyle
			}
			return ""
		}(),
	)))
	aggregateModel := strings.TrimSpace(p.Model)
	if aggregateModel == "" && len(models) > 0 {
		aggregateModel = models[0].Model
	}
	if (kind == "subscription" || kind == "local") && len(models) == 0 {
		aggregateModel = ""
	}
	return Profile{
		Name:                   name,
		Kind:                   kind,
		LocalProvider:          localProvider,
		SubscriptionProviderID: strings.TrimSpace(p.SubscriptionProviderID),
		ModelAdapter:           normalizeModelAdapter(p.ModelAdapter, kind, localProvider),
		CLI:                    p.CLI,
		APIStyle:               apiStyle,
		BaseURL:                strings.TrimSpace(p.BaseURL),
		APIKey:                 p.APIKey,
		Model:                  aggregateModel,
		Models:                 models,
	}
}

func isLocalProxyStubProfileName(name string) bool {
	return strings.HasPrefix(strings.TrimSpace(name), "__local_proxy_")
}

func isInternalStoreProfileName(name string) bool {
	key := strings.TrimSpace(name)
	if !strings.HasPrefix(key, "__") {
		return false
	}
	return isLocalProxyStubProfileName(key) || key == "__claude_subscription__" || key == "__codex_subscription__"
}

// ProviderIDFromStoreProfile maps a persisted vendor profile to a fixed provider id.
func ProviderIDFromStoreProfile(p Profile) string {
	kind := strings.ToLower(strings.TrimSpace(p.Kind))
	switch kind {
	case "subscription":
		subID := strings.TrimSpace(p.SubscriptionProviderID)
		if subID == provider.ClaudeCodeProviderID || subID == provider.CodexProviderID {
			return subID
		}
		if id := provider.ProviderIDFromVendorName(p.Name); id == provider.ClaudeCodeProviderID || id == provider.CodexProviderID {
			return id
		}
		return ""
	case "local":
		if strings.EqualFold(strings.TrimSpace(p.Name), OllamaProfileName) {
			return provider.OllamaProviderID
		}
		return ""
	case "api":
		if strings.EqualFold(strings.TrimSpace(p.Name), CustomAPIProfileName) {
			return provider.CustomAPIProviderID
		}
		return ""
	default:
		return ""
	}
}

// IsAllowedUserVendorProfile reports whether a user-facing vendor may be persisted.
func IsAllowedUserVendorProfile(p Profile) bool {
	name := strings.TrimSpace(p.Name)
	if name == "" || isInternalStoreProfileName(name) {
		return false
	}
	return ProviderIDFromStoreProfile(p) != ""
}

// IsAllowedStoreProfile reports whether a profile row may remain in the store.
func IsAllowedStoreProfile(p Profile) bool {
	name := strings.TrimSpace(p.Name)
	if name == "" {
		return false
	}
	if isInternalStoreProfileName(name) {
		return true
	}
	return IsAllowedUserVendorProfile(p)
}

func isLocalProxyStubActiveValue(value string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(value)), "__local_proxy_")
}

// ParseModelBinding parses @model:Vendor/model-id bindings.
func ParseModelBinding(binding string) (vendorName, modelID string, ok bool) {
	value := strings.TrimSpace(binding)
	if !strings.HasPrefix(value, ModelBindingPrefix) {
		return "", "", false
	}
	rest := strings.TrimPrefix(value, ModelBindingPrefix)
	slash := strings.Index(rest, "/")
	if slash <= 0 || slash >= len(rest)-1 {
		return "", "", false
	}
	return rest[:slash], rest[slash+1:], true
}

type VendorModelHit struct {
	Vendor Profile
	Model  Model
}

func vendorKindRank(kind string) int {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "subscription":
		return 0
	case "local":
		return 1
	default:
		return 2
	}
}

func isBuiltinSubscriptionVendorName(name string) bool {
	key := strings.ToLower(strings.TrimSpace(name))
	for _, def := range subscriptionVendorDefs {
		if strings.ToLower(def.Name) == key {
			return true
		}
	}
	return false
}

func defaultSubscriptionStoreProfile(def struct {
	SubscriptionProviderID string
	Name                   string
}) Profile {
	return NormalizeVendorProfile(Profile{
		Name:                   def.Name,
		Kind:                   "subscription",
		SubscriptionProviderID: def.SubscriptionProviderID,
		ModelAdapter:           "subscription",
	}, 0)
}

func defaultOllamaStoreProfile() Profile {
	return NormalizeVendorProfile(Profile{
		Name:          OllamaProfileName,
		Kind:          "local",
		LocalProvider: provider.OllamaProviderID,
		ModelAdapter:  "ollama",
		BaseURL:       "http://127.0.0.1:11434/v1",
		APIKey:        "ollama",
	}, 0)
}

func defaultCustomAPIStoreProfile() Profile {
	return NormalizeVendorProfile(Profile{
		Name:         CustomAPIProfileName,
		Kind:         "api",
		ModelAdapter: "manual",
	}, 0)
}

// FindStoreVendorProfile resolves a vendor by name with built-in precedence.
func FindStoreVendorProfile(s *Store, vendorName string) (Profile, bool) {
	if s == nil {
		return Profile{}, false
	}
	key := strings.ToLower(strings.TrimSpace(vendorName))
	if key == "" {
		return Profile{}, false
	}

	if isBuiltinSubscriptionVendorName(vendorName) {
		for _, def := range subscriptionVendorDefs {
			if strings.ToLower(def.Name) != key {
				continue
			}
			for _, p := range s.List {
				if p.Kind == "subscription" && strings.TrimSpace(p.SubscriptionProviderID) == def.SubscriptionProviderID {
					return p, true
				}
			}
			return defaultSubscriptionStoreProfile(def), true
		}
	}

	if strings.EqualFold(vendorName, OllamaProfileName) {
		for _, p := range s.List {
			if strings.EqualFold(p.Name, OllamaProfileName) && p.Kind == "local" {
				return p, true
			}
		}
		return defaultOllamaStoreProfile(), true
	}

	if strings.EqualFold(vendorName, CustomAPIProfileName) {
		for _, p := range s.List {
			if strings.EqualFold(p.Name, CustomAPIProfileName) && p.Kind == "api" {
				return p, true
			}
		}
		return defaultCustomAPIStoreProfile(), true
	}

	var matches []Profile
	for _, p := range s.List {
		if strings.EqualFold(strings.TrimSpace(p.Name), key) {
			matches = append(matches, p)
		}
	}
	if len(matches) == 0 {
		return Profile{}, false
	}
	best := matches[0]
	bestRank := vendorKindRank(best.Kind)
	for _, p := range matches[1:] {
		if r := vendorKindRank(p.Kind); r < bestRank {
			best = p
			bestRank = r
		}
	}
	return best, true
}

func subscriptionDefaultAPIStyle(vendor Profile) apistyle.Style {
	if strings.TrimSpace(vendor.SubscriptionProviderID) == provider.CodexProviderID {
		return apistyle.OpenAIResponses
	}
	return apistyle.Claude
}

// FindVendorModel resolves a vendor/model pair, including subscription wire fallbacks.
func FindVendorModel(s *Store, vendorName, modelID string) (VendorModelHit, bool) {
	vendor, ok := FindStoreVendorProfile(s, vendorName)
	if !ok {
		return VendorModelHit{}, false
	}
	id := strings.ToLower(strings.TrimSpace(modelID))
	if id == "" {
		return VendorModelHit{}, false
	}
	for _, m := range vendor.Models {
		mid := strings.ToLower(strings.TrimSpace(m.ID))
		upstream := strings.ToLower(strings.TrimSpace(m.Model))
		if mid == id || upstream == id {
			return VendorModelHit{Vendor: vendor, Model: m}, true
		}
	}
	if strings.EqualFold(strings.TrimSpace(vendor.Kind), "subscription") {
		wire := strings.TrimSpace(modelID)
		if wire != "" && !strings.EqualFold(wire, "default") {
			return VendorModelHit{
				Vendor: vendor,
				Model: NormalizeModelEntry(Model{
					ID:       wire,
					Label:    wire,
					Model:    wire,
					APIStyle: subscriptionDefaultAPIStyle(vendor),
				}, 0),
			}, true
		}
	}
	return VendorModelHit{}, false
}

// MergeVendorModels merges fetched models into existing vendor models by id.
func MergeVendorModels(existing, fetched []Model) []Model {
	type key struct {
		id string
	}
	m := map[string]Model{}
	order := make([]string, 0, len(existing)+len(fetched))
	for _, raw := range existing {
		entry := NormalizeModelEntry(raw, 0)
		k := strings.ToLower(entry.ID)
		m[k] = entry
		order = append(order, k)
	}
	for _, raw := range fetched {
		incoming := NormalizeModelEntry(raw, 0)
		k := strings.ToLower(incoming.ID)
		if prev, ok := m[k]; ok {
			m[k] = Model{
				ID:       prev.ID,
				Label:    firstNonEmpty(prev.Label, incoming.Label),
				Model:    incoming.Model,
				APIStyle: firstStyle(prev.APIStyle, incoming.APIStyle),
				BaseURL:  firstNonEmpty(incoming.BaseURL, prev.BaseURL),
				APIKey:   firstNonEmpty(incoming.APIKey, prev.APIKey),
			}
		} else {
			m[k] = incoming
			order = append(order, k)
		}
	}
	out := make([]Model, 0, len(order))
	seen := map[string]struct{}{}
	for _, k := range order {
		if _, ok := seen[k]; ok {
			continue
		}
		seen[k] = struct{}{}
		out = append(out, m[k])
	}
	return out
}

func isPlaceholderSubscriptionModelEntry(entry Model) bool {
	id := strings.ToLower(strings.TrimSpace(entry.ID))
	model := strings.ToLower(strings.TrimSpace(entry.Model))
	return model == "" || id == "default" || model == "default"
}

func pruneStaleBuiltinVendors(s *Store) bool {
	if s == nil {
		return false
	}
	before := len(s.List)
	filtered := s.List[:0]
	for _, p := range s.List {
		name := strings.TrimSpace(p.Name)
		if isBuiltinSubscriptionVendorName(name) && p.Kind != "subscription" {
			continue
		}
		if strings.EqualFold(name, OllamaProfileName) && strings.ToLower(strings.TrimSpace(p.Kind)) != "local" {
			continue
		}
		if strings.EqualFold(name, CustomAPIProfileName) && strings.ToLower(strings.TrimSpace(p.Kind)) != "api" {
			continue
		}
		filtered = append(filtered, p)
	}
	s.List = filtered
	return len(s.List) != before
}

func renameActiveBindings(s *Store, oldName, newName string) {
	if s == nil || s.Active == nil {
		return
	}
	oldKey := strings.ToLower(strings.TrimSpace(oldName))
	next := strings.TrimSpace(newName)
	if oldKey == "" || next == "" {
		return
	}
	for cli, activeName := range s.Active {
		vendorName, modelID, ok := ParseModelBinding(activeName)
		if ok && strings.EqualFold(vendorName, oldName) {
			s.Active[cli] = ModelBindingPrefix + next + "/" + modelID
		}
	}
}

func ensureDefaultSubscriptionVendors(s *Store) bool {
	if s == nil {
		return false
	}
	changed := pruneStaleBuiltinVendors(s)
	for _, def := range subscriptionVendorDefs {
		idx := -1
		for i, p := range s.List {
			if p.Kind == "subscription" && strings.TrimSpace(p.SubscriptionProviderID) == def.SubscriptionProviderID {
				idx = i
				break
			}
		}
		if idx < 0 {
			s.List = append(s.List, defaultSubscriptionStoreProfile(def))
			changed = true
			continue
		}
		p := &s.List[idx]
		if p.Name != def.Name {
			renameActiveBindings(s, p.Name, def.Name)
			p.Name = def.Name
			changed = true
		}
		if p.Kind != "subscription" {
			p.Kind = "subscription"
			changed = true
		}
		if strings.TrimSpace(p.SubscriptionProviderID) != def.SubscriptionProviderID {
			p.SubscriptionProviderID = def.SubscriptionProviderID
			changed = true
		}
		if strings.TrimSpace(p.ModelAdapter) != "subscription" {
			p.ModelAdapter = "subscription"
			changed = true
		}
		if p.Models == nil {
			p.Models = []Model{}
			changed = true
		} else if len(p.Models) == 1 && isPlaceholderSubscriptionModelEntry(p.Models[0]) {
			p.Models = []Model{}
			changed = true
		}
	}
	return changed
}

func isOllamaBuiltinPlaceholderModel(entry Model) bool {
	id := strings.ToLower(strings.TrimSpace(entry.ID))
	model := strings.TrimSpace(entry.Model)
	label := strings.TrimSpace(entry.Label)
	if id == "default" {
		return true
	}
	return id == "llama3.2" && model == "llama3.2" && label == "Llama 3.2"
}

func pruneOllamaBuiltinPlaceholderModels(s *Store) bool {
	if s == nil {
		return false
	}
	var profile *Profile
	for i := range s.List {
		if strings.EqualFold(s.List[i].Name, OllamaProfileName) {
			profile = &s.List[i]
			break
		}
	}
	if profile == nil || len(profile.Models) == 0 {
		return false
	}
	before := len(profile.Models)
	kept := make([]Model, 0, len(profile.Models))
	for _, raw := range profile.Models {
		entry := NormalizeModelEntry(raw, 0)
		if isOllamaBuiltinPlaceholderModel(entry) {
			binding := ModelBindingPrefix + OllamaProfileName + "/" + entry.ID
			for cli, activeName := range s.Active {
				if activeName == binding {
					delete(s.Active, cli)
				}
			}
			continue
		}
		kept = append(kept, entry)
	}
	if len(kept) == before {
		return false
	}
	profile.Models = kept
	if len(kept) == 0 {
		profile.Model = ""
	}
	return true
}

func stampModelsWithVendorConnection(models []Model, baseURL, apiKey string) []Model {
	url := strings.TrimSpace(baseURL)
	key := strings.TrimSpace(apiKey)
	out := make([]Model, len(models))
	for i, m := range models {
		entry := NormalizeModelEntry(m, i)
		if entry.BaseURL == "" {
			entry.BaseURL = url
		}
		if entry.APIKey == "" {
			entry.APIKey = key
		}
		out[i] = entry
	}
	return out
}

func isExtraAPIProfile(p Profile) bool {
	if p.Kind != "api" {
		return false
	}
	name := strings.TrimSpace(p.Name)
	if name == "" || strings.HasPrefix(name, "__") {
		return false
	}
	if !IsAllowedUserVendorProfile(p) {
		return true
	}
	return !strings.EqualFold(name, CustomAPIProfileName)
}

func ensureDefaultCustomAPIVendor(s *Store) bool {
	if s == nil {
		return false
	}
	changed := false
	customIdx := -1
	for i, p := range s.List {
		if strings.EqualFold(p.Name, CustomAPIProfileName) && p.Kind == "api" {
			customIdx = i
			break
		}
	}
	extras := make([]Profile, 0)
	for _, p := range s.List {
		if isExtraAPIProfile(p) {
			extras = append(extras, p)
		}
	}
	if customIdx < 0 {
		merged := defaultCustomAPIStoreProfile()
		for _, extra := range extras {
			stamped := stampModelsWithVendorConnection(extra.Models, extra.BaseURL, extra.APIKey)
			merged.Models = MergeVendorModels(merged.Models, stamped)
		}
		s.List = append(s.List, merged)
		customIdx = len(s.List) - 1
		changed = true
	} else {
		custom := &s.List[customIdx]
		for _, extra := range extras {
			stamped := stampModelsWithVendorConnection(extra.Models, extra.BaseURL, extra.APIKey)
			custom.Models = MergeVendorModels(custom.Models, stamped)
			changed = true
		}
	}
	if len(extras) > 0 {
		filtered := s.List[:0]
		for _, p := range s.List {
			if !isExtraAPIProfile(p) {
				filtered = append(filtered, p)
			}
		}
		s.List = filtered
		changed = true
		for i, p := range s.List {
			if strings.EqualFold(p.Name, CustomAPIProfileName) && p.Kind == "api" {
				customIdx = i
				break
			}
		}
	}
	if customIdx < 0 || customIdx >= len(s.List) {
		return changed
	}
	profile := &s.List[customIdx]
	if profile.Name != CustomAPIProfileName {
		renameActiveBindings(s, profile.Name, CustomAPIProfileName)
		profile.Name = CustomAPIProfileName
		changed = true
	}
	if profile.Kind != "api" {
		profile.Kind = "api"
		changed = true
	}
	if strings.TrimSpace(profile.ModelAdapter) != "manual" {
		profile.ModelAdapter = "manual"
		changed = true
	}
	if strings.TrimSpace(profile.BaseURL) != "" || strings.TrimSpace(profile.APIKey) != "" {
		profile.Models = stampModelsWithVendorConnection(profile.Models, profile.BaseURL, profile.APIKey)
		profile.BaseURL = ""
		profile.APIKey = ""
		changed = true
	}
	return changed
}

// EnsureDefaultOllamaProfile ensures built-in vendors exist and are normalized.
func EnsureDefaultOllamaProfile(s *Store) bool {
	if s == nil {
		return false
	}
	changed := ensureDefaultSubscriptionVendors(s)
	idx := -1
	for i, p := range s.List {
		if strings.EqualFold(p.Name, OllamaProfileName) {
			idx = i
			break
		}
	}
	defaults := defaultOllamaStoreProfile()
	if idx < 0 {
		s.List = append(s.List, defaults)
		changed = true
	} else {
		p := &s.List[idx]
		if p.Kind != "local" {
			p.Kind = "local"
			changed = true
		}
		if !strings.EqualFold(strings.TrimSpace(p.LocalProvider), provider.OllamaProviderID) {
			p.LocalProvider = provider.OllamaProviderID
			changed = true
		}
		if strings.TrimSpace(p.BaseURL) == "" {
			p.BaseURL = defaults.BaseURL
			changed = true
		}
		if strings.TrimSpace(p.APIKey) == "" {
			p.APIKey = defaults.APIKey
			changed = true
		}
		if strings.TrimSpace(p.ModelAdapter) != "ollama" {
			p.ModelAdapter = "ollama"
			changed = true
		}
		if pruneOllamaBuiltinPlaceholderModels(s) {
			changed = true
		}
	}
	if ensureDefaultCustomAPIVendor(s) {
		changed = true
	}
	return changed
}

// SanitizeActiveBindings removes stale __local_proxy_* and invalid @model bindings.
func SanitizeActiveBindings(s *Store) bool {
	if s == nil {
		return false
	}
	if s.Active == nil {
		s.Active = map[string]string{}
		return false
	}
	changed := false
	for cli, activeName := range map[string]string(s.Active) {
		value := strings.TrimSpace(activeName)
		if value == "" {
			delete(s.Active, cli)
			changed = true
			continue
		}
		if isLocalProxyStubActiveValue(value) || !strings.HasPrefix(value, ModelBindingPrefix) {
			delete(s.Active, cli)
			changed = true
			continue
		}
		vendorName, modelID, ok := ParseModelBinding(value)
		if !ok {
			delete(s.Active, cli)
			changed = true
			continue
		}
		if _, ok := FindVendorModel(s, vendorName, modelID); !ok {
			delete(s.Active, cli)
			changed = true
		}
	}
	return changed
}

func enforceAllowedProfiles(s *Store) bool {
	if s == nil {
		return false
	}
	before := len(s.List)
	filtered := s.List[:0]
	for _, p := range s.List {
		if IsAllowedStoreProfile(p) {
			filtered = append(filtered, p)
		}
	}
	s.List = filtered
	return len(s.List) != before
}

// FinalizeDesktopStore applies desktop defaults and sanitization in-place.
func FinalizeDesktopStore(s *Store) {
	if s == nil {
		return
	}
	EnsureDefaultOllamaProfile(s)
	enforceAllowedProfiles(s)
	SanitizeActiveBindings(s)
}

// NormalizeDesktopStore normalizes all vendor profiles and applies desktop defaults.
func NormalizeDesktopStore(s *Store) *Store {
	if s == nil {
		s = emptyStore()
	}
	if s.Version == 0 {
		s.Version = StoreVersion
	}
	if s.Active == nil {
		s.Active = map[string]string{}
	}
	ensureProxyDefaults(s, s.Version)
	normalized := make([]Profile, len(s.List))
	for i, p := range s.List {
		normalized[i] = NormalizeVendorProfile(p, i)
	}
	s.List = normalized
	FinalizeDesktopStore(s)
	return s
}

// LoadDesktop loads profiles.json with desktop normalization applied.
func LoadDesktop() (*Store, error) {
	s, err := Load()
	if err != nil {
		return nil, err
	}
	return NormalizeDesktopStore(s), nil
}

// SaveDesktop persists a desktop-normalized store.
func SaveDesktop(s *Store) error {
	NormalizeDesktopStore(s)
	return Save(s)
}

// RemoveLocalProxyStubs drops ephemeral __local_proxy_* profiles.
func RemoveLocalProxyStubs(s *Store) {
	if s == nil {
		return
	}
	filtered := s.List[:0]
	for _, p := range s.List {
		if !isLocalProxyStubProfileName(p.Name) {
			filtered = append(filtered, p)
		}
	}
	s.List = filtered
}

// ingressStylePriority is the preferred proxy ingress wire order for multi-style CLIs:
// messages (claude) → responses → chat → gemini (only when upstream is gemini).
var ingressStylePriority = []apistyle.Style{
	apistyle.Claude,
	apistyle.OpenAIResponses,
	apistyle.OpenAIChat,
	apistyle.Gemini,
}

func ingressStylesForCLI(kind clikind.Kind) []apistyle.Style {
	switch kind {
	case clikind.ClaudeCode:
		return []apistyle.Style{apistyle.Claude}
	case clikind.Codex:
		return []apistyle.Style{apistyle.OpenAIResponses}
	case clikind.Hermes, clikind.KimiCode, clikind.OpenCode, clikind.OpenClaw:
		return []apistyle.Style{apistyle.Claude, apistyle.OpenAIResponses, apistyle.OpenAIChat, apistyle.Gemini}
	default:
		return []apistyle.Style{apistyle.OpenAIChat}
	}
}

func ingressStyleSupported(supported []apistyle.Style, want apistyle.Style) bool {
	for _, st := range supported {
		if st == want {
			return true
		}
	}
	return false
}

func pickPreferredIngressStyle(supported []apistyle.Style) apistyle.Style {
	for _, st := range ingressStylePriority {
		if ingressStyleSupported(supported, st) {
			return st
		}
	}
	if len(supported) > 0 {
		return supported[0]
	}
	return apistyle.OpenAIChat
}

// CliIngressStyle returns the default API style segment for local proxy ingress paths.
func CliIngressStyle(kind clikind.Kind) apistyle.Style {
	return pickPreferredIngressStyle(ingressStylesForCLI(kind))
}

// IngressStyleForCLI picks proxy ingress style from CLI kind and vendor/model wire style.
// Priority: messages (claude) → responses → chat; gemini only when upstream is gemini.
// Hermes + Codex uses responses (Hermes api_mode codex_responses).
func IngressStyleForCLI(kind clikind.Kind, hit VendorModelHit) apistyle.Style {
	supported := ingressStylesForCLI(kind)
	if len(supported) == 1 {
		return supported[0]
	}

	modelStyle := firstStyle(hit.Model.APIStyle, hit.Vendor.APIStyle)
	providerID := ProviderIDFromStoreProfile(hit.Vendor)

	if kind == clikind.Hermes && providerID == provider.CodexProviderID {
		if ingressStyleSupported(supported, apistyle.OpenAIResponses) {
			return apistyle.OpenAIResponses
		}
	}
	if modelStyle == apistyle.Gemini && ingressStyleSupported(supported, apistyle.Gemini) {
		return apistyle.Gemini
	}
	return pickPreferredIngressStyle(supported)
}

// ResolveWireModelForIngress returns path model id and CLI wire model for proxy ingress.
func ResolveWireModelForIngress(hit VendorModelHit, parsedModelID string) (modelID, modelWire string) {
	modelID = strings.TrimSpace(parsedModelID)
	modelWire = strings.TrimSpace(firstNonEmpty(hit.Model.Model, hit.Model.ID, modelID))
	if modelWire == "" {
		modelWire = modelID
	}
	if modelID == "" {
		modelID = modelWire
	}
	return modelID, modelWire
}
