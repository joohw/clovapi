package controller

import (
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

// minGroupRatioAmongEnable 与前端模型定价页一致：在模型可用分组中取当前用户分组倍率的最小值（最便宜），找不到则 1。
func minGroupRatioAmongEnable(enableGroups []string, groupRatio map[string]float64) float64 {
	if len(enableGroups) == 0 {
		return 1
	}
	min := -1.0
	for _, g := range enableGroups {
		if r, ok := groupRatio[g]; ok {
			if min < 0 || r < min {
				min = r
			}
		}
	}
	if min < 0 {
		return 1
	}
	return min
}

// fillPricingInputOutputUSD 按 ratio_sync / 前端约定：input USD/1M = model_ratio * 2 * group_ratio；output = input * completion_ratio；按次为 model_price * group_ratio。
func fillPricingInputOutputUSD(pricing []model.Pricing, groupRatio map[string]float64) []model.Pricing {
	out := make([]model.Pricing, len(pricing))
	for i := range pricing {
		p := pricing[i]
		gr := minGroupRatioAmongEnable(p.EnableGroup, groupRatio)
		switch p.QuotaType {
		case 0:
			// 与 web helpers calculateModelPrice 中 inputRatioPriceUSD = model_ratio * 2 * usedGroupRatio 一致
			p.InputPrice = p.ModelRatio * 2 * gr
			p.OutputPrice = p.InputPrice * p.CompletionRatio
		case 1:
			p.InputPrice = p.ModelPrice * gr
			p.OutputPrice = p.ModelPrice * gr
		default:
			p.InputPrice = 0
			p.OutputPrice = 0
		}
		out[i] = p
	}
	return out
}

func GetPricing(c *gin.Context) {
	pricingRaw := model.GetPricing()
	userId, exists := c.Get("id")
	usableGroup := map[string]string{}
	groupRatio := map[string]float64{}
	for s, f := range ratio_setting.GetGroupRatioCopy() {
		groupRatio[s] = f
	}
	var group string
	if exists {
		user, err := model.GetUserCache(userId.(int))
		if err == nil {
			group = user.Group
			for g := range groupRatio {
				ratio, ok := ratio_setting.GetGroupGroupRatio(group, g)
				if ok {
					groupRatio[g] = ratio
				}
			}
		}
	}

	usableGroup = service.GetUserUsableGroups(group)
	// check groupRatio contains usableGroup
	for group := range ratio_setting.GetGroupRatioCopy() {
		if _, ok := usableGroup[group]; !ok {
			delete(groupRatio, group)
		}
	}

	pricing := fillPricingInputOutputUSD(pricingRaw, groupRatio)

	c.JSON(200, gin.H{
		"success":            true,
		"data":               pricing,
		"vendors":            model.GetVendors(),
		"group_ratio":        groupRatio,
		"usable_group":       usableGroup,
		"supported_endpoint": model.GetSupportedEndpointMap(),
		"auto_groups":        service.GetUserAutoGroup(group),
		"pricing_version":    "a42d372ccf0b5dd13ecf71203521f9d2",
	})
}

func ResetModelRatio(c *gin.Context) {
	defaultStr := ratio_setting.DefaultModelRatio2JSONString()
	err := model.UpdateOption("ModelRatio", defaultStr)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	err = ratio_setting.UpdateModelRatioByJSONString(defaultStr)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(200, gin.H{
		"success": true,
		"message": "重置模型倍率成功",
	})
}
