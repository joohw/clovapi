package ratio_setting

import (
	"fmt"
	"io"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/types"
)

const (
	defaultModelsDevAPIURL = "https://models.dev/api.json"
)

var (
	modelsDevBaselineInputUSDPerMMap     = types.NewRWMap[string, float64]()
	modelsDevBaselineOutputUSDPerMMap    = types.NewRWMap[string, float64]()
	modelsDevBaselineCacheReadUSDPerMMap = types.NewRWMap[string, float64]()
)

type modelsDevProvider struct {
	Models map[string]modelsDevModel `json:"models"`
}

type modelsDevModel struct {
	Cost modelsDevCost `json:"cost"`
}

type modelsDevCost struct {
	Input     *float64 `json:"input"`
	Output    *float64 `json:"output"`
	CacheRead *float64 `json:"cache_read"`
}

type modelsDevCandidate struct {
	Provider  string
	Input     float64
	Output    *float64
	CacheRead *float64
}

func cloneFloatPtr(v *float64) *float64 {
	if v == nil {
		return nil
	}
	out := *v
	return &out
}

func validNonNegativeFloat(v float64) bool {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return false
	}
	return v >= 0
}

func buildModelsDevCandidate(provider string, cost modelsDevCost) (modelsDevCandidate, bool) {
	if cost.Input == nil {
		return modelsDevCandidate{}, false
	}
	input := *cost.Input
	if !validNonNegativeFloat(input) {
		return modelsDevCandidate{}, false
	}

	var output *float64
	if cost.Output != nil {
		if !validNonNegativeFloat(*cost.Output) {
			return modelsDevCandidate{}, false
		}
		output = cloneFloatPtr(cost.Output)
	}

	var cacheRead *float64
	if cost.CacheRead != nil {
		if !validNonNegativeFloat(*cost.CacheRead) {
			return modelsDevCandidate{}, false
		}
		cacheRead = cloneFloatPtr(cost.CacheRead)
	}

	return modelsDevCandidate{
		Provider:  provider,
		Input:     input,
		Output:    output,
		CacheRead: cacheRead,
	}, true
}

func shouldReplaceModelsDevCandidate(current, next modelsDevCandidate) bool {
	currentNonZero := current.Input > 0
	nextNonZero := next.Input > 0
	if currentNonZero != nextNonZero {
		return nextNonZero
	}
	if nextNonZero && current.Input != next.Input {
		return next.Input < current.Input
	}
	return next.Provider < current.Provider
}

func loadModelsDevBaselineFromReader(reader io.Reader) (map[string]float64, map[string]float64, map[string]float64, error) {
	var upstreamData map[string]modelsDevProvider
	if err := common.DecodeJson(reader, &upstreamData); err != nil {
		return nil, nil, nil, fmt.Errorf("decode models.dev response failed: %w", err)
	}
	if len(upstreamData) == 0 {
		return nil, nil, nil, fmt.Errorf("models.dev response is empty")
	}

	providers := make([]string, 0, len(upstreamData))
	for provider := range upstreamData {
		providers = append(providers, provider)
	}
	sort.Strings(providers)

	selectedCandidates := make(map[string]modelsDevCandidate)
	for _, provider := range providers {
		providerData := upstreamData[provider]
		if len(providerData.Models) == 0 {
			continue
		}

		modelNames := make([]string, 0, len(providerData.Models))
		for modelName := range providerData.Models {
			modelNames = append(modelNames, modelName)
		}
		sort.Strings(modelNames)

		for _, modelName := range modelNames {
			candidate, ok := buildModelsDevCandidate(provider, providerData.Models[modelName].Cost)
			if !ok {
				continue
			}
			current, exists := selectedCandidates[modelName]
			if !exists || shouldReplaceModelsDevCandidate(current, candidate) {
				selectedCandidates[modelName] = candidate
			}
		}
	}
	if len(selectedCandidates) == 0 {
		return nil, nil, nil, fmt.Errorf("no valid pricing entries in models.dev")
	}

	inputMap := make(map[string]float64, len(selectedCandidates))
	outputMap := make(map[string]float64, len(selectedCandidates))
	cacheReadMap := make(map[string]float64, len(selectedCandidates))
	for modelName, candidate := range selectedCandidates {
		if candidate.Input < 0 {
			continue
		}
		inputMap[modelName] = candidate.Input

		if candidate.Output != nil && *candidate.Output >= 0 {
			outputMap[modelName] = *candidate.Output
		}
		if candidate.CacheRead != nil && *candidate.CacheRead >= 0 {
			cacheReadMap[modelName] = *candidate.CacheRead
		}
	}
	if len(inputMap) == 0 {
		return nil, nil, nil, fmt.Errorf("no input pricing entries in models.dev")
	}
	return inputMap, outputMap, cacheReadMap, nil
}

func InitModelsDevBaselinePricing() error {
	if !common.GetEnvOrDefaultBool("MODELS_DEV_BASELINE_ENABLED", true) {
		modelsDevBaselineInputUSDPerMMap.Clear()
		modelsDevBaselineOutputUSDPerMMap.Clear()
		modelsDevBaselineCacheReadUSDPerMMap.Clear()
		common.SysLog("models.dev baseline pricing disabled")
		return nil
	}

	apiURL := strings.TrimSpace(common.GetEnvOrDefaultString("MODELS_DEV_API_URL", defaultModelsDevAPIURL))
	if apiURL == "" {
		apiURL = defaultModelsDevAPIURL
	}
	timeoutSec := common.GetEnvOrDefault("MODELS_DEV_TIMEOUT_SECONDS", 12)
	if timeoutSec <= 0 {
		timeoutSec = 12
	}
	retry := common.GetEnvOrDefault("MODELS_DEV_RETRY", 2)
	if retry < 1 {
		retry = 1
	}
	maxMB := common.GetEnvOrDefault("MODELS_DEV_MAX_MB", 16)
	if maxMB <= 0 {
		maxMB = 16
	}
	maxBytes := int64(maxMB) << 20

	client := &http.Client{Timeout: time.Duration(timeoutSec) * time.Second}
	var lastErr error
	for i := 0; i < retry; i++ {
		req, err := http.NewRequest(http.MethodGet, apiURL, nil)
		if err != nil {
			return err
		}
		req.Header.Set("Accept", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		func() {
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				lastErr = fmt.Errorf("models.dev returned status: %s", resp.Status)
				return
			}
			limited := io.LimitReader(resp.Body, maxBytes)
			inputMap, outputMap, cacheReadMap, parseErr := loadModelsDevBaselineFromReader(limited)
			if parseErr != nil {
				lastErr = parseErr
				return
			}
			modelsDevBaselineInputUSDPerMMap.Clear()
			modelsDevBaselineInputUSDPerMMap.AddAll(inputMap)
			modelsDevBaselineOutputUSDPerMMap.Clear()
			modelsDevBaselineOutputUSDPerMMap.AddAll(outputMap)
			modelsDevBaselineCacheReadUSDPerMMap.Clear()
			modelsDevBaselineCacheReadUSDPerMMap.AddAll(cacheReadMap)
			lastErr = nil
		}()
		if lastErr == nil {
			common.SysLog(fmt.Sprintf("models.dev baseline pricing loaded, entries=%d", modelsDevBaselineInputUSDPerMMap.Len()))
			return nil
		}
	}
	return lastErr
}

func getModelTokenUSDPricesFromModelsDevBaseline(model string) (inputPerM, outputPerM, cacheReadPerM float64, ok bool) {
	for _, candidate := range modelPricingCandidateNames(model) {
		in, found := modelsDevBaselineInputUSDPerMMap.Get(candidate)
		if !found || in <= 0 {
			continue
		}
		out, okOut := modelsDevBaselineOutputUSDPerMMap.Get(candidate)
		if !okOut || out < 0 {
			out = in
		}
		cr, okCr := modelsDevBaselineCacheReadUSDPerMMap.Get(candidate)
		if !okCr || cr < 0 {
			cr = in
		}
		return in, out, cr, true
	}
	return 0, 0, 0, false
}
