package ratio_setting

import "github.com/QuantumNous/new-api/types"

// 模型溢价倍率：在美元标价与分组倍率之外再乘一层，默认 1（不溢价），常见 1.0–1.x。
var modelPremiumRatioMap = types.NewRWMap[string, float64]()

func ModelPremiumRatio2JSONString() string {
	return modelPremiumRatioMap.MarshalJSONString()
}

func UpdateModelPremiumRatioByJSONString(jsonStr string) error {
	return types.LoadFromJsonStringWithCallback(modelPremiumRatioMap, jsonStr, InvalidateExposedDataCache)
}

// GetModelPremiumRatio 未配置或无效时返回 1。
func GetModelPremiumRatio(name string) float64 {
	v, ok := modelPremiumRatioMap.Get(name)
	if !ok || v <= 0 {
		return 1.0
	}
	return v
}
