package controller

import (
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

func parseJSONAny(raw string) (any, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, false
	}
	var v any
	if err := common.UnmarshalJsonStr(trimmed, &v); err != nil {
		return nil, false
	}
	return v, true
}

func extractMergedResponseText(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	// SSE: merge data chunk delta.content in order.
	if strings.Contains(trimmed, "data:") {
		lines := strings.Split(trimmed, "\n")
		var sb strings.Builder
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if !strings.HasPrefix(line, "data:") {
				continue
			}
			payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if payload == "" || payload == "[DONE]" {
				continue
			}
			var obj map[string]any
			if err := common.UnmarshalJsonStr(payload, &obj); err != nil {
				continue
			}
			choices, ok := obj["choices"].([]any)
			if !ok || len(choices) == 0 {
				continue
			}
			first, ok := choices[0].(map[string]any)
			if !ok {
				continue
			}
			delta, _ := first["delta"].(map[string]any)
			if delta != nil {
				if c, _ := delta["content"].(string); c != "" {
					sb.WriteString(c)
				}
			}
		}
		return sb.String()
	}
	// Non-stream JSON response.
	v, ok := parseJSONAny(trimmed)
	if !ok {
		return raw
	}
	obj, ok := v.(map[string]any)
	if !ok {
		return raw
	}
	choices, ok := obj["choices"].([]any)
	if !ok || len(choices) == 0 {
		return raw
	}
	first, ok := choices[0].(map[string]any)
	if !ok {
		return raw
	}
	if msg, _ := first["message"].(map[string]any); msg != nil {
		if c, _ := msg["content"].(string); c != "" {
			return c
		}
	}
	if delta, _ := first["delta"].(map[string]any); delta != nil {
		if c, _ := delta["content"].(string); c != "" {
			return c
		}
	}
	return raw
}

func buildMergedSSEResponse(respRaw string) (map[string]any, bool) {
	trimmed := strings.TrimSpace(respRaw)
	if trimmed == "" || !strings.Contains(trimmed, "data:") {
		return nil, false
	}
	lines := strings.Split(trimmed, "\n")
	merged := map[string]any{}
	var contentBuilder strings.Builder
	var finishReason string
	var parsedCount int

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" || payload == "[DONE]" {
			continue
		}
		var obj map[string]any
		if err := common.UnmarshalJsonStr(payload, &obj); err != nil {
			continue
		}
		parsedCount++
		if merged["response_id"] == nil {
			if v, ok := obj["id"]; ok {
				merged["response_id"] = v
			}
		}
		if merged["model"] == nil {
			if v, ok := obj["model"]; ok {
				merged["model"] = v
			}
		}
		if merged["provider"] == nil {
			if v, ok := obj["provider"]; ok {
				merged["provider"] = v
			}
		}
		if merged["created"] == nil {
			if v, ok := obj["created"]; ok {
				merged["created"] = v
			}
		}
		if v, ok := obj["usage"]; ok {
			merged["usage"] = v
		}
		choices, ok := obj["choices"].([]any)
		if !ok || len(choices) == 0 {
			continue
		}
		first, ok := choices[0].(map[string]any)
		if !ok {
			continue
		}
		if fr, ok := first["finish_reason"].(string); ok && strings.TrimSpace(fr) != "" {
			finishReason = fr
		}
		delta, _ := first["delta"].(map[string]any)
		if delta != nil {
			if c, ok := delta["content"].(string); ok && c != "" {
				contentBuilder.WriteString(c)
			}
		}
	}

	if parsedCount == 0 {
		return nil, false
	}
	text := contentBuilder.String()
	merged["choices"] = []any{text}
	if strings.TrimSpace(finishReason) != "" {
		merged["finish_reason"] = finishReason
	}
	return merged, true
}

func buildRequestTopLevel(reqRaw string) map[string]any {
	req := map[string]any{}
	if v, ok := parseJSONAny(reqRaw); ok {
		if obj, castOK := v.(map[string]any); castOK {
			req = obj
		} else {
			req["raw"] = reqRaw
		}
	} else if strings.TrimSpace(reqRaw) != "" {
		req["raw"] = reqRaw
	}
	return req
}

func buildResponseTopLevel(respRaw string) map[string]any {
	resp := map[string]any{}
	if sseResp, ok := buildMergedSSEResponse(respRaw); ok {
		for k, v := range sseResp {
			resp[k] = v
		}
		resp["merged_text"] = extractMergedResponseText(respRaw)
		return resp
	}
	resp["merged_text"] = extractMergedResponseText(respRaw)
	if v, ok := parseJSONAny(respRaw); ok {
		if obj, castOK := v.(map[string]any); castOK {
			for k, val := range obj {
				resp[k] = val
			}
			return resp
		}
	}
	if strings.TrimSpace(respRaw) != "" {
		resp["raw"] = respRaw
	}
	return resp
}

func buildMergedConversationPayload(rec *model.ConversationRecord, reqRaw string, respRaw string) string {
	if rec == nil {
		return ""
	}
	status := "success"
	if rec.StatusCode >= 400 {
		status = "error"
	}
	payload := map[string]any{
		"request_id": rec.RequestId,
		"start_time": time.Unix(rec.CreatedAt, 0).Format(time.RFC3339),
		"end_time":   time.Unix(rec.CreatedAt, 0).Format(time.RFC3339),
		"model":      rec.ModelName,
		"call_type":  rec.Path,
		"status":     status,
		"request":    buildRequestTopLevel(reqRaw),
		"response":   buildResponseTopLevel(respRaw),
		"meta": map[string]any{
			"path":        rec.Path,
			"method":      rec.Method,
			"status_code": rec.StatusCode,
			"is_stream":   rec.IsStream,
		},
	}
	if b, err := common.Marshal(payload); err == nil {
		return string(b)
	}
	return ""
}

func GetAllLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	username := c.Query("username")
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	requestId := c.Query("request_id")
	logs, total, err := model.GetAllLogs(logType, startTimestamp, endTimestamp, modelName, username, tokenName, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), channel, group, requestId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
	return
}

func GetUserLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	userId := c.GetInt("id")
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	group := c.Query("group")
	requestId := c.Query("request_id")
	logs, total, err := model.GetUserLogs(userId, logType, startTimestamp, endTimestamp, modelName, tokenName, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), group, requestId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
	return
}

// Deprecated: SearchAllLogs 已废弃，前端未使用该接口。
func SearchAllLogs(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": false,
		"message": "该接口已废弃",
	})
}

// Deprecated: SearchUserLogs 已废弃，前端未使用该接口。
func SearchUserLogs(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": false,
		"message": "该接口已废弃",
	})
}

func GetLogByKey(c *gin.Context) {
	tokenId := c.GetInt("token_id")
	if tokenId == 0 {
		c.JSON(200, gin.H{
			"success": false,
			"message": "无效的令牌",
		})
		return
	}
	logs, err := model.GetLogByTokenId(tokenId)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(200, gin.H{
		"success": true,
		"message": "",
		"data":    logs,
	})
}

func GetLogsStat(c *gin.Context) {
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	username := c.Query("username")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	stat, err := model.SumUsedQuota(logType, startTimestamp, endTimestamp, modelName, username, tokenName, channel, group)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, "")
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota": stat.Quota,
			"rpm":   stat.Rpm,
			"tpm":   stat.Tpm,
		},
	})
	return
}

func GetLogsSelfStat(c *gin.Context) {
	username := c.GetString("username")
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	quotaNum, err := model.SumUsedQuota(logType, startTimestamp, endTimestamp, modelName, username, tokenName, channel, group)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, tokenName)
	c.JSON(200, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota": quotaNum.Quota,
			"rpm":   quotaNum.Rpm,
			"tpm":   quotaNum.Tpm,
			//"token": tokenNum,
		},
	})
	return
}

func DeleteHistoryLogs(c *gin.Context) {
	targetTimestamp, _ := strconv.ParseInt(c.Query("target_timestamp"), 10, 64)
	if targetTimestamp == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "target timestamp is required",
		})
		return
	}
	count, err := model.DeleteOldLog(c.Request.Context(), targetTimestamp, 100)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    count,
	})
	return
}

func GetConversationByRequestId(c *gin.Context) {
	requestId := c.Query("request_id")
	if requestId == "" {
		common.ApiErrorMsg(c, "request_id is required")
		return
	}
	rec, err := model.GetConversationByRequestId(requestId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if rec == nil {
		common.ApiSuccess(c, nil)
		return
	}
	// Do not expose filesystem paths directly in UI unless needed.
	common.ApiSuccess(c, rec)
}

func GetConversationSelfByRequestId(c *gin.Context) {
	userId := c.GetInt("id")
	requestId := c.Query("request_id")
	if requestId == "" {
		common.ApiErrorMsg(c, "request_id is required")
		return
	}
	rec, err := model.GetConversationByRequestIdAndUserId(requestId, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if rec == nil {
		common.ApiSuccess(c, nil)
		return
	}
	common.ApiSuccess(c, rec)
}

func GetConversationBodyByRequestId(c *gin.Context) {
	requestId := c.Query("request_id")
	if requestId == "" {
		common.ApiErrorMsg(c, "request_id is required")
		return
	}
	rec, err := model.GetConversationByRequestId(requestId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if rec == nil {
		common.ApiSuccess(c, gin.H{"body": ""})
		return
	}
	reqBody := rec.RequestBody
	if reqBody == "" && rec.RequestBodyPath != "" {
		if b, readErr := os.ReadFile(rec.RequestBodyPath); readErr == nil {
			reqBody = string(b)
		}
	}
	respBody := rec.ResponseBody
	if respBody == "" && rec.ResponseBodyPath != "" {
		if b, readErr := os.ReadFile(rec.ResponseBodyPath); readErr == nil {
			respBody = string(b)
		}
	}
	body := buildMergedConversationPayload(rec, reqBody, respBody)
	common.ApiSuccess(c, gin.H{"body": body})
}

func GetConversationSelfBodyByRequestId(c *gin.Context) {
	userId := c.GetInt("id")
	requestId := c.Query("request_id")
	if requestId == "" {
		common.ApiErrorMsg(c, "request_id is required")
		return
	}
	rec, err := model.GetConversationByRequestIdAndUserId(requestId, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if rec == nil {
		common.ApiSuccess(c, gin.H{"body": ""})
		return
	}
	reqBody := rec.RequestBody
	if reqBody == "" && rec.RequestBodyPath != "" {
		if b, readErr := os.ReadFile(rec.RequestBodyPath); readErr == nil {
			reqBody = string(b)
		}
	}
	respBody := rec.ResponseBody
	if respBody == "" && rec.ResponseBodyPath != "" {
		if b, readErr := os.ReadFile(rec.ResponseBodyPath); readErr == nil {
			respBody = string(b)
		}
	}
	body := buildMergedConversationPayload(rec, reqBody, respBody)
	common.ApiSuccess(c, gin.H{"body": body})
}
