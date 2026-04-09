package helper

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

// HandleGroupRatio checks for "auto_group" in the context and updates the group ratio and relayInfo.UsingGroup if present
func HandleGroupRatio(ctx *gin.Context, relayInfo *relaycommon.RelayInfo) types.GroupRatioInfo {
	groupRatioInfo := types.GroupRatioInfo{
		GroupRatio:        1.0,
		GroupSpecialRatio: -1,
	}

	autoGroup, exists := ctx.Get("auto_group")
	if exists {
		logger.LogDebug(ctx, fmt.Sprintf("final group: %s", autoGroup))
		relayInfo.UsingGroup = autoGroup.(string)
	}

	userGroupRatio, ok := ratio_setting.GetGroupGroupRatio(relayInfo.UserGroup, relayInfo.UsingGroup)
	if ok {
		groupRatioInfo.GroupSpecialRatio = userGroupRatio
		groupRatioInfo.GroupRatio = userGroupRatio
		groupRatioInfo.HasSpecialRatio = true
	} else {
		groupRatioInfo.GroupRatio = ratio_setting.GetGroupRatio(relayInfo.UsingGroup)
	}

	return groupRatioInfo
}

// applyModelPremium 将模型溢价倍率写入 OtherRatios，供 PostTextConsumeQuota 等与分组倍率连乘。
func applyModelPremium(pd *types.PriceData, modelName string) {
	prem := ratio_setting.GetModelPremiumRatio(modelName)
	if prem != 1.0 {
		pd.AddOtherRatio("premium", prem)
	}
}

func ModelPriceHelper(c *gin.Context, info *relaycommon.RelayInfo, promptTokens int, meta *types.TokenCountMeta) (types.PriceData, error) {
	groupRatioInfo := HandleGroupRatio(c, info)

	if pc, ok := ratio_setting.GetModelPerCallUSD(info.OriginModelName); ok && pc > 0 {
		prem := ratio_setting.GetModelPremiumRatio(info.OriginModelName)
		preConsumedQuota := int(pc * common.QuotaPerUnit * groupRatioInfo.GroupRatio * prem)
		if meta.ImagePriceRatio != 0 {
			pc = pc * meta.ImagePriceRatio
			preConsumedQuota = int(pc * common.QuotaPerUnit * groupRatioInfo.GroupRatio * prem)
		}
		freeModel := false
		if !operation_setting.GetQuotaSetting().EnableFreeModelPreConsume {
			if groupRatioInfo.GroupRatio == 0 || pc == 0 {
				preConsumedQuota = 0
				freeModel = true
			}
		}
		pd := types.PriceData{
			FreeModel:         freeModel,
			UsePerCall:        true,
			PerCallUSD:        pc,
			GroupRatioInfo:    groupRatioInfo,
			QuotaToPreConsume: preConsumedQuota,
		}
		applyModelPremium(&pd, info.OriginModelName)
		info.PriceData = pd
		return pd, nil
	}

	in, out, cr, ok := ratio_setting.GetModelTokenUSDPrices(info.OriginModelName)
	if !ok {
		if info.UserSetting.AcceptUnsetRatioModel {
			pd := types.PriceData{
				FreeModel:         true,
				GroupRatioInfo:    groupRatioInfo,
				QuotaToPreConsume: 0,
			}
			info.PriceData = pd
			return pd, nil
		}
		return types.PriceData{}, fmt.Errorf("模型 %s 未配置美元价格（输入价 USD/1M 或按次价），请在管理端设置；Model %s pricing not configured", info.OriginModelName, info.OriginModelName)
	}

	preConsumedTokens := common.Max(promptTokens, common.PreConsumedQuota)
	maxOut := 0
	if meta != nil {
		maxOut = meta.MaxTokens
	}
	estUSD := float64(preConsumedTokens)*in/1e6 + float64(maxOut)*out/1e6
	// 预扣略保守：缓存命中按输入价（若与 cr 不同，可能略高估，可接受）
	_ = cr

	prem := ratio_setting.GetModelPremiumRatio(info.OriginModelName)
	preConsumedQuota := int(estUSD * common.QuotaPerUnit * groupRatioInfo.GroupRatio * prem)

	freeModel := false
	if !operation_setting.GetQuotaSetting().EnableFreeModelPreConsume {
		if groupRatioInfo.GroupRatio == 0 || in == 0 {
			preConsumedQuota = 0
			freeModel = true
		}
	}

	pd := types.PriceData{
		FreeModel:         freeModel,
		InputUSDPerM:      in,
		OutputUSDPerM:     out,
		CacheReadUSDPerM:  cr,
		GroupRatioInfo:    groupRatioInfo,
		QuotaToPreConsume: preConsumedQuota,
	}
	applyModelPremium(&pd, info.OriginModelName)
	if common.DebugEnabled {
		println(fmt.Sprintf("model_price_helper result: %s", pd.ToSetting()))
	}
	info.PriceData = pd
	return pd, nil
}

// ModelPriceHelperPerCall 按次计费的 PriceHelper (MJ、Task)
func ModelPriceHelperPerCall(c *gin.Context, info *relaycommon.RelayInfo) (types.PriceData, error) {
	groupRatioInfo := HandleGroupRatio(c, info)

	modelPrice, ok := ratio_setting.GetModelPerCallUSD(info.OriginModelName)
	if !ok || modelPrice <= 0 {
		if info.UserSetting.AcceptUnsetRatioModel {
			modelPrice = float64(common.PreConsumedQuota) / common.QuotaPerUnit
		} else {
			return types.PriceData{}, fmt.Errorf("模型 %s 未配置按次价（美元/次），请在管理端设置；Model %s per-call price not set", info.OriginModelName, info.OriginModelName)
		}
	}
	prem := ratio_setting.GetModelPremiumRatio(info.OriginModelName)
	quota := int(modelPrice * common.QuotaPerUnit * groupRatioInfo.GroupRatio * prem)

	freeModel := false
	if !operation_setting.GetQuotaSetting().EnableFreeModelPreConsume {
		if groupRatioInfo.GroupRatio == 0 || modelPrice == 0 {
			quota = 0
			freeModel = true
		}
	}

	pd := types.PriceData{
		FreeModel:      freeModel,
		UsePerCall:     true,
		PerCallUSD:     modelPrice,
		Quota:          quota,
		GroupRatioInfo: groupRatioInfo,
	}
	applyModelPremium(&pd, info.OriginModelName)
	return pd, nil
}

func ContainPriceOrRatio(modelName string) bool {
	return ratio_setting.ModelHasPricing(modelName)
}
