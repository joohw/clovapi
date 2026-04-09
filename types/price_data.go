package types

import "fmt"

type GroupRatioInfo struct {
	GroupRatio        float64
	GroupSpecialRatio float64
	HasSpecialRatio   bool
}

// PriceData 按量：Input/Output/CacheRead 为 USD/1M tokens；按次：PerCallUSD 为每次美元。
type PriceData struct {
	FreeModel bool

	UsePerCall bool
	PerCallUSD float64

	InputUSDPerM     float64
	OutputUSDPerM    float64
	CacheReadUSDPerM float64

	Quota             int
	QuotaToPreConsume int
	GroupRatioInfo    GroupRatioInfo
	OtherRatios       map[string]float64
}

func (p *PriceData) AddOtherRatio(key string, ratio float64) {
	if p.OtherRatios == nil {
		p.OtherRatios = make(map[string]float64)
	}
	if ratio <= 0 {
		return
	}
	p.OtherRatios[key] = ratio
}

func (p *PriceData) ToSetting() string {
	return fmt.Sprintf("PerCallUSD: %f, InputUSDPerM: %f, OutputUSDPerM: %f, CacheReadUSDPerM: %f, GroupRatio: %f, QuotaToPreConsume: %d",
		p.PerCallUSD, p.InputUSDPerM, p.OutputUSDPerM, p.CacheReadUSDPerM, p.GroupRatioInfo.GroupRatio, p.QuotaToPreConsume)
}
