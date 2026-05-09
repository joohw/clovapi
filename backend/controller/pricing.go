package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

// sessionUserID 从 TryUserAuth 等中间件解析登录用户 id（兼容 int / float64）。
func sessionUserID(c *gin.Context) (int, bool) {
	idVal, exists := c.Get("id")
	if !exists || idVal == nil {
		return 0, false
	}
	switch v := idVal.(type) {
	case int:
		return v, v > 0
	case float64:
		uid := int(v)
		return uid, uid > 0
	default:
		return 0, false
	}
}

// userRelayVisibleModelSet 与 ListModels（未启用令牌模型限制、未覆盖 TokenGroup）一致：用户在其分组下 abilities 中可用且满足倍率/计价配置的模型名。
func userRelayVisibleModelSet(userId int) (map[string]struct{}, error) {
	acceptUnsetRatioModel := operation_setting.SelfUseModeEnabled
	if !acceptUnsetRatioModel {
		userSettings, _ := model.GetUserSetting(userId, false)
		if userSettings.AcceptUnsetRatioModel {
			acceptUnsetRatioModel = true
		}
	}

	userGroup, err := model.GetUserGroup(userId, false)
	if err != nil {
		return nil, err
	}
	group := userGroup

	var names []string
	if group == "auto" {
		for _, autoGroup := range service.GetUserAutoGroup(userGroup) {
			for _, g := range model.GetGroupEnabledModels(autoGroup) {
				if !common.StringsContains(names, g) {
					names = append(names, g)
				}
			}
		}
	} else {
		names = model.GetGroupEnabledModels(group)
	}

	out := make(map[string]struct{}, len(names))
	for _, modelName := range names {
		if !acceptUnsetRatioModel {
			if !ratio_setting.ModelHasPricing(modelName) {
				continue
			}
		}
		out[modelName] = struct{}{}
	}
	return out, nil
}

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

// fillPricingInputOutputUSD 列表展示价 = 基准美元价 × 分组倍率（在模型可用分组中取最小组倍率）。
func fillPricingInputOutputUSD(pricing []model.Pricing, groupRatio map[string]float64) []model.Pricing {
	out := make([]model.Pricing, len(pricing))
	for i := range pricing {
		p := pricing[i]
		gr := minGroupRatioAmongEnable(p.EnableGroup, groupRatio)
		prem := ratio_setting.GetModelPremiumRatio(p.ModelName)
		switch p.QuotaType {
		case 0:
			p.InputPrice = p.InputUSDPerM * gr * prem
			p.OutputPrice = p.OutputUSDPerM * gr * prem
			p.CacheReadPrice = p.CacheReadUSDPerM * gr * prem
		case 1:
			p.InputPrice = p.PerCallUSD * gr * prem
			p.OutputPrice = p.PerCallUSD * gr * prem
			p.CacheReadPrice = 0
		default:
			p.InputPrice = 0
			p.OutputPrice = 0
			p.CacheReadPrice = 0
		}
		out[i] = p
	}
	return out
}

func GetPricing(c *gin.Context) {
	pricingRaw := model.GetPricing()
	uid, hasUser := sessionUserID(c)
	usableGroup := map[string]string{}
	groupRatio := map[string]float64{}
	for s, f := range ratio_setting.GetGroupRatioCopy() {
		groupRatio[s] = f
	}
	var group string
	if hasUser {
		user, err := model.GetUserCache(uid)
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

	// 普通用户：定价/模型页仅展示其分组实际可路由的模型，与 /v1/models 一致；管理员保留全量以便后台维护。
	if hasUser && !model.IsAdmin(uid) {
		allowed, err := userRelayVisibleModelSet(uid)
		if err != nil {
			c.JSON(200, gin.H{
				"success": false,
				"message": err.Error(),
			})
			return
		}
		filtered := make([]model.Pricing, 0, len(allowed))
		for _, p := range pricing {
			if _, ok := allowed[p.ModelName]; ok {
				filtered = append(filtered, p)
			}
		}
		pricing = filtered
	}

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
	empty := "{}"
	keys := []string{
		"ModelInputUSDPerM",
		"ModelOutputUSDPerM",
		"ModelCacheReadUSDPerM",
		"ModelPerCallUSD",
		"ModelPremiumRatio",
	}
	for _, k := range keys {
		if err := model.UpdateOption(k, empty); err != nil {
			c.JSON(200, gin.H{"success": false, "message": err.Error()})
			return
		}
	}
	_ = ratio_setting.UpdateModelInputUSDPerMByJSONString(empty)
	_ = ratio_setting.UpdateModelOutputUSDPerMByJSONString(empty)
	_ = ratio_setting.UpdateModelCacheReadUSDPerMByJSONString(empty)
	_ = ratio_setting.UpdateModelPerCallUSDByJSONString(empty)
	_ = ratio_setting.UpdateModelPremiumRatioByJSONString(empty)
	model.GetPricing()
	c.JSON(200, gin.H{
		"success": true,
		"message": "已清空模型美元定价与溢价配置",
	})
}
