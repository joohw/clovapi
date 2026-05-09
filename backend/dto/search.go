package dto

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

// DefaultSearchRoutingModel 用于渠道选择与计费路由；请求体可省略 model，由网关注入。
const DefaultSearchRoutingModel = "search-v1"

// SearchRequest is a provider-agnostic search relay request.
// Extra provider-specific parameters are carried via RawParams.
type SearchRequest struct {
	Model     string                 `json:"model"`
	Query     string                 `json:"query"`
	RawParams map[string]interface{} `json:"-"`
}

func (r *SearchRequest) UnmarshalJSON(data []byte) error {
	type Alias SearchRequest
	aux := &Alias{}
	if err := common.Unmarshal(data, aux); err != nil {
		return err
	}
	raw := make(map[string]interface{})
	if err := common.Unmarshal(data, &raw); err != nil {
		return err
	}
	r.Model = strings.TrimSpace(aux.Model)
	r.Query = strings.TrimSpace(aux.Query)
	r.RawParams = raw
	return nil
}

func (r *SearchRequest) Validate() error {
	if r.Query == "" {
		return errors.New("query is required")
	}
	return nil
}

func (r *SearchRequest) GetTokenCountMeta() *types.TokenCountMeta {
	return &types.TokenCountMeta{
		TokenType:   types.TokenTypeTokenizer,
		CombineText: r.Query,
	}
}

func (r *SearchRequest) IsStream(c *gin.Context) bool {
	return false
}

func (r *SearchRequest) SetModelName(modelName string) {
	r.Model = modelName
	if r.RawParams == nil {
		r.RawParams = make(map[string]interface{})
	}
	r.RawParams["model"] = modelName
}
