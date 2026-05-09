package ratio_setting

import (
	"strings"

	"github.com/QuantumNous/new-api/types"
)

// 模型计费改为「美元标价」四件套（按量：输入/输出/缓存命中 为 USD/1M tokens；按次：每次 USD），不再使用倍率体系。

var (
	modelInputUSDPerMMap     = types.NewRWMap[string, float64]()
	modelOutputUSDPerMMap    = types.NewRWMap[string, float64]()
	modelCacheReadUSDPerMMap = types.NewRWMap[string, float64]()
	modelPerCallUSDMap       = types.NewRWMap[string, float64]()
)

func modelPricingCandidateNames(name string) []string {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil
	}
	candidates := make([]string, 0, 6)
	seen := make(map[string]struct{}, 6)
	add := func(v string) {
		v = strings.TrimSpace(v)
		if v == "" {
			return
		}
		if _, ok := seen[v]; ok {
			return
		}
		seen[v] = struct{}{}
		candidates = append(candidates, v)
	}

	add(name)
	add(FormatMatchingModelName(name))

	// 兼容渠道自定义前缀模型名（如 anthropic/claude-sonnet-4）。
	if slash := strings.Index(name, "/"); slash > 0 && slash < len(name)-1 {
		withoutProvider := name[slash+1:]
		add(withoutProvider)
		add(FormatMatchingModelName(withoutProvider))
	}

	if strings.HasSuffix(name, CompactModelSuffix) {
		base := strings.TrimSuffix(name, CompactModelSuffix)
		add(base)
		add(FormatMatchingModelName(base))
	}

	return candidates
}

func findModelPerCallUSD(name string) (float64, bool) {
	for _, candidate := range modelPricingCandidateNames(name) {
		if v, ok := modelPerCallUSDMap.Get(candidate); ok {
			return v, true
		}
	}
	return 0, false
}

func findModelInputUSDPerM(name string) (matchedName string, value float64, ok bool) {
	for _, candidate := range modelPricingCandidateNames(name) {
		if v, exists := modelInputUSDPerMMap.Get(candidate); exists && v > 0 {
			return candidate, v, true
		}
	}
	return "", 0, false
}

func ModelInputUSDPerM2JSONString() string {
	return modelInputUSDPerMMap.MarshalJSONString()
}

func ModelOutputUSDPerM2JSONString() string {
	return modelOutputUSDPerMMap.MarshalJSONString()
}

func ModelCacheReadUSDPerM2JSONString() string {
	return modelCacheReadUSDPerMMap.MarshalJSONString()
}

func ModelPerCallUSD2JSONString() string {
	return modelPerCallUSDMap.MarshalJSONString()
}

func UpdateModelInputUSDPerMByJSONString(jsonStr string) error {
	return types.LoadFromJsonStringWithCallback(modelInputUSDPerMMap, jsonStr, InvalidateExposedDataCache)
}

func UpdateModelOutputUSDPerMByJSONString(jsonStr string) error {
	return types.LoadFromJsonStringWithCallback(modelOutputUSDPerMMap, jsonStr, InvalidateExposedDataCache)
}

func UpdateModelCacheReadUSDPerMByJSONString(jsonStr string) error {
	return types.LoadFromJsonStringWithCallback(modelCacheReadUSDPerMMap, jsonStr, InvalidateExposedDataCache)
}

func UpdateModelPerCallUSDByJSONString(jsonStr string) error {
	return types.LoadFromJsonStringWithCallback(modelPerCallUSDMap, jsonStr, InvalidateExposedDataCache)
}

func GetModelInputUSDPerM(name string) (float64, bool) {
	_, v, ok := findModelInputUSDPerM(name)
	return v, ok
}

func GetModelOutputUSDPerM(name string) (float64, bool) {
	return modelOutputUSDPerMMap.Get(name)
}

// GetModelCacheReadUSDPerM 未单独配置时返回 false，计费侧应对齐为输入价。
func GetModelCacheReadUSDPerM(name string) (float64, bool) {
	return modelCacheReadUSDPerMMap.Get(name)
}

func GetModelPerCallUSD(name string) (float64, bool) {
	return findModelPerCallUSD(name)
}

// ModelHasPricing 用于列表/令牌限制：配置了按次价，或配置了按量输入价（>0）。
func ModelHasPricing(name string) bool {
	if v, ok := GetModelPerCallUSD(name); ok && v > 0 {
		return true
	}
	_, _, ok := findModelInputUSDPerM(name)
	if ok {
		return true
	}
	_, _, _, ok = getModelTokenUSDPricesFromModelsDevBaseline(name)
	return ok
}

// GetModelTokenUSDPrices 返回按量三价；cacheRead 未配置时与 input 相同。
func GetModelTokenUSDPrices(model string) (inputPerM, outputPerM, cacheReadPerM float64, ok bool) {
	matchedName, in, ok := findModelInputUSDPerM(model)
	if !ok {
		return getModelTokenUSDPricesFromModelsDevBaseline(model)
	}
	out, okOut := modelOutputUSDPerMMap.Get(matchedName)
	if !okOut || out < 0 {
		out = in
	}
	cr, okCr := modelCacheReadUSDPerMMap.Get(matchedName)
	if !okCr || cr < 0 {
		cr = in
	}
	return in, out, cr, true
}

func GetModelInputUSDPerMCopy() map[string]float64 {
	return modelInputUSDPerMMap.ReadAll()
}

func GetModelOutputUSDPerMCopy() map[string]float64 {
	return modelOutputUSDPerMMap.ReadAll()
}

func GetModelCacheReadUSDPerMCopy() map[string]float64 {
	return modelCacheReadUSDPerMMap.ReadAll()
}

func GetModelPerCallUSDCopy() map[string]float64 {
	return modelPerCallUSDMap.ReadAll()
}
