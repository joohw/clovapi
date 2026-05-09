package model

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
)

// DocsAgentEnvLink 一次性兑换链接：用于在无 Cookie 终端通过 curl 拉取 agent env 脚本（密钥仅在首次 GET 响应中下发）。
type DocsAgentEnvLink struct {
	Id        int    `json:"id" gorm:"primaryKey"`
	Code      string `json:"code" gorm:"size:64;uniqueIndex;not null"`
	UserId    int    `json:"user_id" gorm:"index;not null"`
	TokenId   int    `json:"token_id" gorm:"not null"`
	Client    string `json:"client" gorm:"size:32;not null"`
	Model     string `json:"model" gorm:"type:text"`
	// Platform 创建短链时用户所选系统：unix（macOS/Linux/Git Bash）或 windows（PowerShell，展示 curl.exe）；兑换脚本仍为 bash。
	Platform  string `json:"platform" gorm:"size:16;default:unix;not null"`
	ExpiresAt int64  `json:"expires_at" gorm:"not null"`
	UsedAt    *int64 `json:"used_at"`
	CreatedAt int64  `json:"created_at" gorm:"not null"`
}

// DocsAgentEnvLinkTTLSeconds 短链有效期（秒）。
const DocsAgentEnvLinkTTLSeconds int64 = 15 * 60

var (
	ErrDocsAgentEnvLinkExpired = errors.New("docs agent env link expired")
	ErrDocsAgentEnvLinkUsed    = errors.New("docs agent env link already used")
)

func randomDocsAgentEnvLinkCode() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// CreateDocsAgentEnvLink 创建一条未使用短链。platform 为 unix 或 windows。
func CreateDocsAgentEnvLink(userId int, tokenId int, client string, model string, platform string) (*DocsAgentEnvLink, error) {
	code, err := randomDocsAgentEnvLinkCode()
	if err != nil {
		return nil, err
	}
	now := time.Now().Unix()
	rec := DocsAgentEnvLink{
		Code:      code,
		UserId:    userId,
		TokenId:   tokenId,
		Client:    client,
		Model:     model,
		Platform:  platform,
		ExpiresAt: now + DocsAgentEnvLinkTTLSeconds,
		CreatedAt: now,
	}
	if err := DB.Create(&rec).Error; err != nil {
		return nil, err
	}
	return &rec, nil
}

// RedeemDocsAgentEnvLink 原子兑换：成功时标记已使用并返回记录（含 client/model/token 指向）。
func RedeemDocsAgentEnvLink(code string) (*DocsAgentEnvLink, error) {
	code = trimDocsLinkCode(code)
	if code == "" {
		return nil, gorm.ErrRecordNotFound
	}
	now := time.Now().Unix()
	res := DB.Model(&DocsAgentEnvLink{}).
		Where("code = ? AND used_at IS NULL AND expires_at > ?", code, now).
		Update("used_at", now)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected != 1 {
		var link DocsAgentEnvLink
		err := DB.Where("code = ?", code).First(&link).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, gorm.ErrRecordNotFound
		}
		if err != nil {
			return nil, err
		}
		if link.ExpiresAt <= now {
			return nil, ErrDocsAgentEnvLinkExpired
		}
		return nil, ErrDocsAgentEnvLinkUsed
	}
	var link DocsAgentEnvLink
	if err := DB.Where("code = ?", code).First(&link).Error; err != nil {
		return nil, err
	}
	return &link, nil
}

func trimDocsLinkCode(s string) string {
	s = strings.TrimSpace(strings.ToLower(s))
	if s == "" {
		return ""
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') {
			continue
		}
		return ""
	}
	return s
}
