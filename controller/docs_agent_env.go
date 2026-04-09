package controller

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// 模型名不做字符集限制（支持冒号等）；仅限制长度，防止异常输入。
const docsAgentEnvModelMaxRunes = 8192

func validateAgentEnvModel(model string) error {
	if model == "" {
		return nil
	}
	if utf8.RuneCountInString(model) > docsAgentEnvModelMaxRunes {
		return fmt.Errorf("model exceeds max length (%d)", docsAgentEnvModelMaxRunes)
	}
	return nil
}

func requestPublicOrigin(c *gin.Context) string {
	scheme := "http"
	if proto := c.GetHeader("X-Forwarded-Proto"); proto != "" {
		scheme = strings.ToLower(strings.TrimSpace(strings.Split(proto, ",")[0]))
	} else if c.Request.TLS != nil {
		scheme = "https"
	}
	host := c.Request.Host
	if host == "" {
		return ""
	}
	return scheme + "://" + host
}

func bashSingleQuoted(s string) string {
	return `'` + strings.ReplaceAll(s, `'`, `'\''`) + `'`
}

// buildAgentEnvScriptBody 生成一行 export，再包成 bash -c 单行命令（与前端历史行为一致）。
func buildAgentEnvScriptBody(client string, apiKey string, base string, model string) string {
	var inner string
	if client == "claude_code" {
		inner = fmt.Sprintf("export ANTHROPIC_API_KEY=%s ANTHROPIC_BASE_URL=%s", bashSingleQuoted(apiKey), bashSingleQuoted(base))
		if model != "" {
			inner += fmt.Sprintf(" ANTHROPIC_MODEL=%s", bashSingleQuoted(model))
		}
	} else {
		inner = fmt.Sprintf("export OPENAI_API_KEY=%s OPENAI_BASE_URL=%s", bashSingleQuoted(apiKey), bashSingleQuoted(base))
		if model != "" {
			inner += fmt.Sprintf(" OPENAI_MODEL=%s", bashSingleQuoted(model))
		}
	}
	return "bash -c " + bashSingleQuoted(inner)
}

// GetDocsAgentEnvSh 返回 bash 脚本（单行 bash -c + export）。须配合 middleware.TokenOrUserAuth：
// - 浏览器会话：Query 须含 token_id，且令牌属于当前用户；
// - Authorization Bearer（API 令牌）：使用头中密钥，Query 可仅含 client、model；若带 token_id 须与头中令牌 id 一致。
func GetDocsAgentEnvSh(c *gin.Context) {
	client := strings.ToLower(strings.TrimSpace(c.Query("client")))
	if client == "" {
		client = "claude_code"
	}
	if client != "claude_code" && client != "openclaw" {
		c.String(http.StatusBadRequest, "# error: client must be claude_code or openclaw\n")
		return
	}
	modelStr := strings.TrimSpace(c.Query("model"))
	if err := validateAgentEnvModel(modelStr); err != nil {
		c.String(http.StatusBadRequest, "# error: model parameter too long\n")
		return
	}

	var apiKey string
	if v, ok := c.Get("token_key"); ok && v != nil {
		s, ok2 := v.(string)
		if !ok2 || s == "" {
			c.String(http.StatusUnauthorized, "# error: unauthorized\n")
			return
		}
		apiKey = s
		tidFromCtx := c.GetInt("token_id")
		if q := strings.TrimSpace(c.Query("token_id")); q != "" {
			tid, err := strconv.Atoi(q)
			if err != nil || tid != tidFromCtx {
				c.String(http.StatusForbidden, "# error: token_id does not match Authorization token\n")
				return
			}
		}
	} else {
		userID := c.GetInt("id")
		if userID <= 0 {
			c.String(http.StatusUnauthorized, "# error: unauthorized (login or use Authorization: Bearer)\n")
			return
		}
		tidStr := strings.TrimSpace(c.Query("token_id"))
		if tidStr == "" {
			c.String(http.StatusBadRequest, "# error: token_id required when using session cookie\n")
			return
		}
		tid, err := strconv.Atoi(tidStr)
		if err != nil || tid <= 0 {
			c.String(http.StatusBadRequest, "# error: invalid token_id\n")
			return
		}
		token, err := model.GetTokenByIds(tid, userID)
		if err != nil || token == nil {
			c.String(http.StatusForbidden, "# error: invalid token_id\n")
			return
		}
		apiKey = token.GetFullKey()
	}

	base, ok := agentEnvResolvedBase(c)
	if !ok {
		c.String(http.StatusInternalServerError, "# error: cannot determine site URL (set ServerAddress in admin)\n")
		return
	}

	body := buildAgentEnvScriptBody(client, apiKey, base, modelStr) + "\n"

	c.Header("Content-Type", "text/plain; charset=utf-8")
	c.Header("X-Content-Type-Options", "nosniff")
	c.String(http.StatusOK, body)
}

func agentEnvResolvedBase(c *gin.Context) (string, bool) {
	base := strings.TrimSpace(system_setting.ServerAddress)
	if base == "" {
		base = requestPublicOrigin(c)
	}
	if base == "" {
		return "", false
	}
	base = strings.TrimRight(base, "/")
	if !strings.HasSuffix(base, "/v1") {
		base = base + "/v1"
	}
	return base, true
}

func docsAgentEnvRedeemAbsURL(c *gin.Context, code string) string {
	pub := strings.TrimSpace(system_setting.ServerAddress)
	if pub == "" {
		pub = requestPublicOrigin(c)
	}
	pub = strings.TrimRight(pub, "/")
	return pub + "/api/checkout/" + code
}

type createDocsAgentEnvLinkReq struct {
	TokenId  int    `json:"token_id"`
	Client   string `json:"client"`
	Model    string `json:"model"`
	Platform string `json:"platform"` // unix | windows
}

// CreateDocsAgentEnvLink 登录用户创建一次性短链，用于在无 Cookie 终端执行 curl … | bash。
func CreateDocsAgentEnvLink(c *gin.Context) {
	userID := c.GetInt("id")
	if userID <= 0 {
		common.ApiErrorMsg(c, "未登录")
		return
	}
	var req createDocsAgentEnvLinkReq
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "无效的请求体")
		return
	}
	client := strings.ToLower(strings.TrimSpace(req.Client))
	if client == "" {
		client = "claude_code"
	}
	if client != "claude_code" && client != "openclaw" {
		common.ApiErrorMsg(c, "client 须为 claude_code 或 openclaw")
		return
	}
	modelStr := strings.TrimSpace(req.Model)
	if err := validateAgentEnvModel(modelStr); err != nil {
		common.ApiErrorMsg(c, "model 过长")
		return
	}
	if req.TokenId <= 0 {
		common.ApiErrorMsg(c, "请提供 token_id")
		return
	}
	platform := strings.ToLower(strings.TrimSpace(req.Platform))
	if platform == "" {
		platform = "unix"
	}
	if platform != "unix" && platform != "windows" {
		common.ApiErrorMsg(c, "platform 须为 unix 或 windows")
		return
	}
	if _, err := model.GetTokenByIds(req.TokenId, userID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			common.ApiErrorMsg(c, "无效的令牌")
		} else {
			common.ApiErrorMsg(c, "无效的令牌")
		}
		return
	}
	rec, err := model.CreateDocsAgentEnvLink(userID, req.TokenId, client, modelStr, platform)
	if err != nil {
		common.ApiErrorMsg(c, "创建短链失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"code":        rec.Code,
			"redeem_url":  docsAgentEnvRedeemAbsURL(c, rec.Code),
			"platform":    rec.Platform,
			"expires_at":  rec.ExpiresAt,
			"ttl_seconds": model.DocsAgentEnvLinkTTLSeconds,
		},
	})
}

// RedeemDocsAgentEnvLink 公开兑换：首次 GET 返回与 agent-env.sh 相同的脚本并作废链接。
func RedeemDocsAgentEnvLink(c *gin.Context) {
	code := c.Param("code")
	link, err := model.RedeemDocsAgentEnvLink(code)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.String(http.StatusNotFound, "# error: link not found\n")
			return
		}
		if errors.Is(err, model.ErrDocsAgentEnvLinkExpired) {
			c.String(http.StatusGone, "# error: link expired\n")
			return
		}
		if errors.Is(err, model.ErrDocsAgentEnvLinkUsed) {
			c.String(http.StatusGone, "# error: link already used\n")
			return
		}
		c.String(http.StatusInternalServerError, "# error: redeem failed\n")
		return
	}
	token, err := model.GetTokenByIds(link.TokenId, link.UserId)
	if err != nil || token == nil {
		c.String(http.StatusGone, "# error: token unavailable\n")
		return
	}
	apiKey := token.GetFullKey()
	base, ok := agentEnvResolvedBase(c)
	if !ok {
		c.String(http.StatusInternalServerError, "# error: cannot determine site URL (set ServerAddress in admin)\n")
		return
	}
	body := buildAgentEnvScriptBody(link.Client, apiKey, base, link.Model) + "\n"
	c.Header("Content-Type", "text/plain; charset=utf-8")
	c.Header("X-Content-Type-Options", "nosniff")
	if link.Platform != "" {
		c.Header("X-Docs-Agent-Platform", link.Platform)
	}
	c.String(http.StatusOK, body)
}
