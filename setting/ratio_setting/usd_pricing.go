package ratio_setting

import (
	"github.com/QuantumNous/new-api/types"
)

// 模型计费改为「美元标价」四件套（按量：输入/输出/缓存命中 为 USD/1M tokens；按次：每次 USD），不再使用倍率体系。

var (
	modelInputUSDPerMMap     = types.NewRWMap[string, float64]()
	modelOutputUSDPerMMap    = types.NewRWMap[string, float64]()
	modelCacheReadUSDPerMMap = types.NewRWMap[string, float64]()
	modelPerCallUSDMap       = types.NewRWMap[string, float64]()
)

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
	return modelInputUSDPerMMap.Get(name)
}

func GetModelOutputUSDPerM(name string) (float64, bool) {
	return modelOutputUSDPerMMap.Get(name)
}

// GetModelCacheReadUSDPerM 未单独配置时返回 false，计费侧应对齐为输入价。
func GetModelCacheReadUSDPerM(name string) (float64, bool) {
	return modelCacheReadUSDPerMMap.Get(name)
}

func GetModelPerCallUSD(name string) (float64, bool) {
	return modelPerCallUSDMap.Get(name)
}

// ModelHasPricing 用于列表/令牌限制：配置了按次价，或配置了按量输入价（>0）。
func ModelHasPricing(name string) bool {
	if v, ok := modelPerCallUSDMap.Get(name); ok && v > 0 {
		return true
	}
	v, ok := modelInputUSDPerMMap.Get(name)
	return ok && v > 0
}

// GetModelTokenUSDPrices 返回按量三价；cacheRead 未配置时与 input 相同。
func GetModelTokenUSDPrices(model string) (inputPerM, outputPerM, cacheReadPerM float64, ok bool) {
	in, ok := modelInputUSDPerMMap.Get(model)
	if !ok || in <= 0 {
		return 0, 0, 0, false
	}
	out, okOut := modelOutputUSDPerMMap.Get(model)
	if !okOut || out < 0 {
		out = in
	}
	cr, okCr := modelCacheReadUSDPerMMap.Get(model)
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
