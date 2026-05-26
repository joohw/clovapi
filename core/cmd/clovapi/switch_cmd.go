package main

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/apply"
	"github.com/clovapi/switcher/internal/cliswitch"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/syslog"
)

func runSwitch(sc *bufio.Scanner, s *profile.Store, kind agentkind.Kind, resetFlag bool, bindingFlag, providerFlag, vendorFlag, modelFlag, directBaseURL, directAPIKey, directModel, directAPIStyle, positional string) error {
	if resetFlag {
		if strings.TrimSpace(positional) != "" {
			return fmt.Errorf("cannot use --reset with a positional argument")
		}
		if strings.TrimSpace(directBaseURL) != "" || strings.TrimSpace(bindingFlag) != "" {
			return fmt.Errorf("cannot use --reset with --base-url or --binding")
		}
		if strings.TrimSpace(providerFlag) != "" || strings.TrimSpace(vendorFlag) != "" || strings.TrimSpace(modelFlag) != "" {
			return fmt.Errorf("cannot use --reset with --provider, --vendor or --model")
		}
		if err := apply.ResetDefault(kind); err != nil {
			return err
		}
		syslog.LogCLIReset(kind)
		s.ClearActive(string(kind))
		if err := profile.Save(s); err != nil {
			return err
		}
		fmt.Printf("Reset %s to default (cleared clovapi relay bindings).\n", kind)
		return nil
	}

	if strings.TrimSpace(directBaseURL) != "" {
		if strings.TrimSpace(bindingFlag) != "" || strings.TrimSpace(providerFlag) != "" || strings.TrimSpace(vendorFlag) != "" || strings.TrimSpace(modelFlag) != "" || strings.TrimSpace(positional) != "" {
			return fmt.Errorf("cannot combine --base-url with provider/model selection")
		}
		return applyDirectToCLI(kind, directBaseURL, directAPIKey, directModel, directAPIStyle)
	}

	selection, selectionErr := resolveSwitchSelectionOrError(s, kind, providerFlag, vendorFlag, modelFlag, bindingFlag, positional)
	if selectionErr != nil {
		return selectionErr
	}
	if selection.ProviderID != "" {
		return applyProviderModelSwitch(kind, selection.ProviderID, selection.ModelID)
	}

	if picked, ok, err := promptSwitchVendorOnly(sc, s, kind, vendorFlag, modelFlag, positional); err != nil {
		return err
	} else if ok {
		if picked.reset {
			if err := apply.ResetDefault(kind); err != nil {
				return err
			}
			s.ClearActive(string(kind))
			if err := profile.Save(s); err != nil {
				return err
			}
			fmt.Printf("Reset %s to default (cleared clovapi relay bindings).\n", kind)
			return nil
		}
		return applyProviderModelSwitch(kind, picked.selection.ProviderID, picked.selection.ModelID)
	}

	if active := s.Active[string(kind)]; strings.TrimSpace(active.ProviderID) != "" {
		if _, ok := s.FlatProfileForProviderModel(active.ProviderID, active.ModelID); ok {
			return applyProviderModelSwitch(kind, active.ProviderID, active.ModelID)
		}
	}

	if !switchNeedsInteractive(sc, s, kind, bindingFlag, providerFlag, vendorFlag, modelFlag, directBaseURL, positional) {
		return fmt.Errorf("no model selected for %s — pass Vendor/model, or --vendor with --model, or --binding", kind)
	}

	picked, err := promptSwitchForCLI(sc, kind, s)
	if err != nil {
		return err
	}
	if picked.reset {
		if err := apply.ResetDefault(kind); err != nil {
			return err
		}
		s.ClearActive(string(kind))
		if err := profile.Save(s); err != nil {
			return err
		}
		fmt.Printf("Reset %s to default (cleared clovapi relay bindings).\n", kind)
		return nil
	}
	return applyProviderModelSwitch(kind, picked.selection.ProviderID, picked.selection.ModelID)
}

type switchPick struct {
	selection profile.ActiveSelection
	reset     bool
}

func promptSwitchForCLI(sc *bufio.Scanner, kind agentkind.Kind, s *profile.Store) (switchPick, error) {
	vendors := cliswitch.VendorsForCLI(s, kind)
	if len(vendors) == 0 {
		return switchPick{}, fmt.Errorf("no compatible vendors for %s — configure providers in the desktop app or profiles.json", kind)
	}

	fmt.Println()
	fmt.Printf("Switch %s:\n", kind)
	fmt.Println("  0) reset this CLI to default (clear clovapi relay bindings)")

	active := s.Active[string(kind)]
	activeProvider := strings.TrimSpace(active.ProviderID)
	activeModel := strings.TrimSpace(active.ModelID)
	hasActive := activeProvider != "" && activeModel != ""

	var vendorPicks []profile.Profile
	for _, v := range vendors {
		name := strings.TrimSpace(v.Name)
		marker := ""
		if hasActive && profile.ProviderIDFromStoreProfile(v) == activeProvider {
			marker = " (active vendor)"
		}
		fmt.Printf("  %d) %s%s\n", len(vendorPicks)+1, name, marker)
		vendorPicks = append(vendorPicks, v)
	}

	fmt.Print("Choose vendor (number or name): ")
	if !sc.Scan() {
		return switchPick{}, fmt.Errorf("read vendor: %w", sc.Err())
	}
	line := strings.TrimSpace(sc.Text())
	if line == "" {
		return switchPick{}, fmt.Errorf("vendor selection is required")
	}
	if n, err := strconv.Atoi(line); err == nil {
		if n == 0 {
			return switchPick{reset: true}, nil
		}
		if n < 1 || n > len(vendorPicks) {
			return switchPick{}, fmt.Errorf("choose 0–%d", len(vendorPicks))
		}
		return promptModelForVendor(sc, kind, s, vendorPicks[n-1], activeProvider, activeModel, hasActive)
	}
	for _, v := range vendorPicks {
		if strings.EqualFold(strings.TrimSpace(v.Name), line) {
			return promptModelForVendor(sc, kind, s, v, activeProvider, activeModel, hasActive)
		}
	}
	return switchPick{}, fmt.Errorf("unknown vendor %q", line)
}

func promptModelForVendor(sc *bufio.Scanner, kind agentkind.Kind, s *profile.Store, vendor profile.Profile, activeProvider, activeModel string, hasActive bool) (switchPick, error) {
	models := cliswitch.CompatibleModelsForCLI(kind, vendor)
	vendorName := strings.TrimSpace(vendor.Name)

	fmt.Println()
	fmt.Printf("Choose model for %s:\n", vendorName)

	var modelPicks []profile.Model
	for _, m := range models {
		id := strings.TrimSpace(m.ID)
		if id == "" {
			continue
		}
		label := strings.TrimSpace(m.Label)
		if label == "" {
			label = id
		}
		wire := strings.TrimSpace(firstModelWire(m))
		marker := ""
		if hasActive && profile.ProviderIDFromStoreProfile(vendor) == activeProvider && strings.EqualFold(id, activeModel) {
			marker = " (active)"
		}
		fmt.Printf("  %d) %s  wire=%s  style=%s%s\n", len(modelPicks)+1, label, wire, modelStyleShow(m), marker)
		modelPicks = append(modelPicks, m)
	}

	if len(modelPicks) == 0 && cliswitch.VendorCompatibleWithCLI(kind, vendor) && strings.EqualFold(strings.TrimSpace(vendor.Kind), "subscription") {
		fmt.Print("Model id (subscription wire id): ")
		if !sc.Scan() {
			return switchPick{}, fmt.Errorf("read model: %w", sc.Err())
		}
		modelID := strings.TrimSpace(sc.Text())
		selection, err := cliswitch.ResolveSelection(s, kind, vendorName, modelID)
		if err != nil {
			return switchPick{}, err
		}
		return switchPick{selection: selection}, nil
	}
	if len(modelPicks) == 0 {
		return switchPick{}, fmt.Errorf("no compatible models for %s on %s", vendorName, kind)
	}

	fmt.Print("Choose model (number, id, or label): ")
	if !sc.Scan() {
		return switchPick{}, fmt.Errorf("read model: %w", sc.Err())
	}
	line := strings.TrimSpace(sc.Text())
	if line == "" {
		return switchPick{}, fmt.Errorf("model selection is required")
	}
	if n, err := strconv.Atoi(line); err == nil {
		if n < 1 || n > len(modelPicks) {
			return switchPick{}, fmt.Errorf("choose 1–%d", len(modelPicks))
		}
		modelID := strings.TrimSpace(modelPicks[n-1].ID)
		selection, err := cliswitch.ResolveSelection(s, kind, vendorName, modelID)
		if err != nil {
			return switchPick{}, err
		}
		return switchPick{selection: selection}, nil
	}
	for _, m := range modelPicks {
		id := strings.TrimSpace(m.ID)
		label := strings.TrimSpace(m.Label)
		wire := strings.TrimSpace(firstModelWire(m))
		if strings.EqualFold(line, id) || strings.EqualFold(line, label) || strings.EqualFold(line, wire) {
			selection, err := cliswitch.ResolveSelection(s, kind, vendorName, id)
			if err != nil {
				return switchPick{}, err
			}
			return switchPick{selection: selection}, nil
		}
	}
	return switchPick{}, fmt.Errorf("unknown model %q", line)
}

func firstModelWire(m profile.Model) string {
	if wire := strings.TrimSpace(m.Model); wire != "" {
		return wire
	}
	return strings.TrimSpace(m.ID)
}

func modelStyleShow(m profile.Model) string {
	if strings.TrimSpace(string(m.APIStyle)) != "" {
		return string(m.APIStyle)
	}
	return "—"
}

func resolveSwitchSelectionOrError(s *profile.Store, kind agentkind.Kind, providerFlag, vendorFlag, modelFlag, bindingFlag, positional string) (profile.ActiveSelection, error) {
	providerFlag = strings.TrimSpace(providerFlag)
	modelFlag = strings.TrimSpace(modelFlag)
	if providerFlag != "" {
		if modelFlag == "" {
			return profile.ActiveSelection{}, fmt.Errorf("--model is required with --provider")
		}
		hit, ok := profile.FindProviderModel(s, providerFlag, modelFlag)
		if !ok {
			return profile.ActiveSelection{}, cliswitch.ErrModelNotFound
		}
		if !cliswitch.ModelCompatibleWithCLI(kind, hit.Vendor, hit.Model) {
			return profile.ActiveSelection{}, cliswitch.ErrModelIncompatible
		}
		return profile.ActiveSelection{ProviderID: providerFlag, ModelID: hit.Model.ID}, nil
	}
	binding := strings.TrimSpace(bindingFlag)
	if binding != "" {
		if !strings.HasPrefix(binding, profile.ModelBindingPrefix) {
			return profile.ActiveSelection{}, fmt.Errorf("--binding must start with %q", profile.ModelBindingPrefix)
		}
		vendorName, modelID, ok := profile.ParseModelBinding(binding)
		if !ok {
			return profile.ActiveSelection{}, fmt.Errorf("invalid --binding %q", binding)
		}
		return cliswitch.ResolveSelection(s, kind, vendorName, modelID)
	}

	vendorFlag = strings.TrimSpace(vendorFlag)
	positional = strings.TrimSpace(positional)

	if vendorFlag != "" || modelFlag != "" {
		vendorName := vendorFlag
		if vendorName == "" {
			vendorName, _, _, _ = cliswitch.ParseTarget(positional)
		}
		if vendorName == "" {
			return profile.ActiveSelection{}, fmt.Errorf("--vendor is required with --model")
		}
		if strings.TrimSpace(modelFlag) == "" {
			return profile.ActiveSelection{}, nil
		}
		return cliswitch.ResolveSelection(s, kind, vendorName, modelFlag)
	}

	if positional != "" {
		vendorName, modelID, _, ok := cliswitch.ParseTarget(positional)
		if !ok {
			return profile.ActiveSelection{}, fmt.Errorf("invalid switch target %q", positional)
		}
		if modelID == "" {
			return profile.ActiveSelection{}, nil
		}
		return cliswitch.ResolveSelection(s, kind, vendorName, modelID)
	}

	return profile.ActiveSelection{}, nil
}

func applyDirectToCLI(kind agentkind.Kind, baseURL, apiKey, model, styleStr string) error {
	mod := strings.TrimSpace(model)
	if mod == "" {
		return fmt.Errorf("--model is required with --base-url")
	}
	st, err := apistyle.Parse(strings.TrimSpace(styleStr))
	if err != nil {
		if strings.TrimSpace(styleStr) != "" {
			return err
		}
		switch kind {
		case agentkind.ClaudeCode, agentkind.KimiCode:
			st = apistyle.Claude
		case agentkind.Codex:
			st = apistyle.OpenAIResponses
		default:
			st = apistyle.OpenAIChat
		}
	}
	key := strings.TrimSpace(apiKey)
	if key == "" {
		key = "clovapi-local"
	}
	p := profile.Profile{
		Name:     "__direct__",
		CLI:      kind,
		BaseURL:  strings.TrimSpace(baseURL),
		APIKey:   key,
		Model:    mod,
		APIStyle: st,
	}
	if !apply.KindSupportsStyle(kind, p.APIStyle) {
		return fmt.Errorf("cli %q does not support api_style %q (supported here: %s)", kind, p.APIStyle, styleChoices(kind))
	}
	if err := apply.Apply(p); err != nil {
		return err
	}
	fmt.Printf("Applied direct endpoint to %s (model %q)\n", kind, mod)
	return nil
}

func isInteractiveSwitch(sc *bufio.Scanner) bool {
	if sc == nil {
		return false
	}
	return isTerminal(os.Stdin)
}

func isTerminal(f *os.File) bool {
	fi, err := f.Stat()
	if err != nil {
		return false
	}
	return (fi.Mode() & os.ModeCharDevice) != 0
}

func promptSwitchVendorOnly(sc *bufio.Scanner, s *profile.Store, kind agentkind.Kind, vendorFlag, modelFlag, positional string) (switchPick, bool, error) {
	if strings.TrimSpace(modelFlag) != "" {
		return switchPick{}, false, nil
	}
	vendorName := strings.TrimSpace(vendorFlag)
	if vendorName == "" && strings.TrimSpace(positional) != "" {
		v, modelID, _, ok := cliswitch.ParseTarget(positional)
		if ok && modelID == "" {
			vendorName = v
		}
	}
	if vendorName == "" || !switchNeedsInteractive(sc, s, kind, "", "", vendorName, "", "", positional) {
		return switchPick{}, false, nil
	}
	vendor, ok := profile.FindStoreVendorProfile(s, vendorName)
	if !ok {
		return switchPick{}, false, fmt.Errorf("vendor %q not found", vendorName)
	}
	if !cliswitch.VendorCompatibleWithCLI(kind, vendor) {
		return switchPick{}, false, fmt.Errorf("vendor %q is not compatible with %s", vendorName, kind)
	}
	active := s.Active[string(kind)]
	activeProvider := strings.TrimSpace(active.ProviderID)
	activeModel := strings.TrimSpace(active.ModelID)
	picked, err := promptModelForVendor(sc, kind, s, vendor, activeProvider, activeModel, activeProvider != "" && activeModel != "")
	if err != nil {
		return switchPick{}, false, err
	}
	return picked, true, nil
}

func switchNeedsInteractive(sc *bufio.Scanner, s *profile.Store, kind agentkind.Kind, bindingFlag, providerFlag, vendorFlag, modelFlag, directBaseURL, positional string) bool {
	if strings.TrimSpace(bindingFlag) != "" || strings.TrimSpace(providerFlag) != "" || strings.TrimSpace(directBaseURL) != "" {
		return false
	}
	if strings.TrimSpace(vendorFlag) != "" && strings.TrimSpace(modelFlag) != "" {
		return false
	}
	if positional != "" {
		if _, modelID, _, ok := cliswitch.ParseTarget(positional); ok && modelID != "" {
			return false
		}
	}
	if active := s.Active[string(kind)]; strings.TrimSpace(active.ProviderID) != "" {
		if _, ok := s.FlatProfileForProviderModel(active.ProviderID, active.ModelID); ok {
			return false
		}
	}
	return isInteractiveSwitch(sc)
}

func newSwitchScanner() *bufio.Scanner {
	return bufio.NewScanner(os.Stdin)
}

func switchScannerFrom(r io.Reader) *bufio.Scanner {
	return bufio.NewScanner(r)
}
