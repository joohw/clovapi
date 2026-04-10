package relay

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

func SearchHelper(c *gin.Context, info *relaycommon.RelayInfo) (newAPIError *types.NewAPIError) {
	info.InitChannelMeta(c)

	searchReq, ok := info.Request.(*dto.SearchRequest)
	if !ok {
		return types.NewErrorWithStatusCode(fmt.Errorf("invalid request type, expected dto.SearchRequest, got %T", info.Request), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}
	if err := helper.ModelMappedHelper(c, info, searchReq); err != nil {
		return types.NewError(err, types.ErrorCodeChannelModelMappedError, types.ErrOptionWithSkipRetry())
	}

	var (
		req      *http.Request
		err      error
		endpoint string
	)
	baseURL := strings.TrimRight(info.ChannelBaseUrl, "/")
	if baseURL == "" {
		baseURL = constant.ChannelBaseURLs[info.ChannelType]
	}

	switch info.ChannelType {
	case constant.ChannelTypeTavily:
		endpoint = baseURL + "/search"
		payload := make(map[string]any, len(searchReq.RawParams))
		for k, v := range searchReq.RawParams {
			if strings.EqualFold(k, "model") {
				continue
			}
			payload[k] = v
		}
		if _, ok := payload["query"]; !ok {
			payload["query"] = searchReq.Query
		}
		body, mErr := common.Marshal(payload)
		if mErr != nil {
			return types.NewError(mErr, types.ErrorCodeJsonMarshalFailed, types.ErrOptionWithSkipRetry())
		}
		req, err = http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			return types.NewError(err, types.ErrorCodeDoRequestFailed)
		}
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", info.ApiKey))
		req.Header.Set("Content-Type", "application/json")
	case constant.ChannelTypeBrave:
		endpoint = baseURL + "/res/v1/web/search"
		params := url.Values{}
		for k, v := range searchReq.RawParams {
			if strings.EqualFold(k, "model") {
				continue
			}
			appendQueryValue(params, k, v)
		}
		if params.Get("q") == "" {
			params.Set("q", searchReq.Query)
		}
		if encoded := params.Encode(); encoded != "" {
			endpoint += "?" + encoded
		}
		req, err = http.NewRequest(http.MethodGet, endpoint, nil)
		if err != nil {
			return types.NewError(err, types.ErrorCodeDoRequestFailed)
		}
		req.Header.Set("X-Subscription-Token", info.ApiKey)
		req.Header.Set("Accept", "application/json")
	default:
		return types.NewErrorWithStatusCode(fmt.Errorf("search endpoint only supports Tavily/Brave channels"), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}

	client, err := service.NewProxyHttpClient(info.ChannelSetting.Proxy)
	if err != nil {
		return types.NewError(err, types.ErrorCodeDoRequestFailed)
	}
	resp, err := client.Do(req)
	if err != nil {
		return types.NewOpenAIError(err, types.ErrorCodeDoRequestFailed, http.StatusInternalServerError)
	}
	defer resp.Body.Close()

	statusCodeMappingStr := c.GetString("status_code_mapping")
	if resp.StatusCode != http.StatusOK {
		newApiErr := service.RelayErrorHandler(c.Request.Context(), resp, false)
		service.ResetStatusCode(newApiErr, statusCodeMappingStr)
		return newApiErr
	}

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return types.NewError(err, types.ErrorCodeReadResponseBodyFailed)
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}
	c.Data(http.StatusOK, contentType, respBody)

	usage := &dto.Usage{
		PromptTokens:     1,
		CompletionTokens: 0,
		TotalTokens:      1,
	}
	service.PostTextConsumeQuota(c, info, usage, []string{"Search API 按次计费"})
	return nil
}

func appendQueryValue(values url.Values, key string, value any) {
	if key == "" || value == nil {
		return
	}
	switch v := value.(type) {
	case string:
		if strings.TrimSpace(v) != "" {
			values.Add(key, v)
		}
	case bool:
		values.Add(key, strconv.FormatBool(v))
	case float64:
		if v == float64(int64(v)) {
			values.Add(key, strconv.FormatInt(int64(v), 10))
		} else {
			values.Add(key, strconv.FormatFloat(v, 'f', -1, 64))
		}
	case int:
		values.Add(key, strconv.Itoa(v))
	case int64:
		values.Add(key, strconv.FormatInt(v, 10))
	case []any:
		for _, item := range v {
			appendQueryValue(values, key, item)
		}
	case []string:
		for _, item := range v {
			appendQueryValue(values, key, item)
		}
	}
}
