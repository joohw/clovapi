package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// ConversationRecord stores request/response pairs for offline training.
// Use TEXT to keep cross-DB compatibility (SQLite/MySQL/PostgreSQL).
type ConversationRecord struct {
	Id        int   `json:"id" gorm:"primaryKey;autoIncrement"`
	CreatedAt int64 `json:"created_at" gorm:"bigint;index"`

	UserId    int    `json:"user_id" gorm:"index"`
	TokenId   int    `json:"token_id" gorm:"index"`
	Username  string `json:"username" gorm:"index;default:''"`
	TokenName string `json:"token_name" gorm:"default:''"`

	RequestId string `json:"request_id" gorm:"type:varchar(64);index;default:''"`
	Path      string `json:"path" gorm:"index"`
	Method    string `json:"method"`

	ModelName   string `json:"model_name" gorm:"index;default:''"`
	ChannelId   int    `json:"channel_id" gorm:"index;default:0"`
	ChannelType int    `json:"channel_type" gorm:"index;default:0"`

	StatusCode int  `json:"status_code" gorm:"index"`
	IsStream   bool `json:"is_stream"`

	RequestBody       string `json:"request_body" gorm:"type:text"`
	ResponseBody      string `json:"response_body" gorm:"type:text"`
	// When bodies are too large, we store them in files and keep paths here.
	RequestBodyPath  string `json:"request_body_path" gorm:"type:text"`
	ResponseBodyPath string `json:"response_body_path" gorm:"type:text"`
	RequestTruncated  bool   `json:"request_truncated" gorm:"default:false"`
	ResponseTruncated bool   `json:"response_truncated" gorm:"default:false"`

	Other string `json:"other" gorm:"type:text"`
}

func RecordConversation(r *ConversationRecord) {
	if r == nil {
		return
	}
	if r.CreatedAt == 0 {
		r.CreatedAt = common.GetTimestamp()
	}
	if err := DB.Create(r).Error; err != nil {
		common.SysError("failed to record conversation: " + err.Error())
	}
}

func GetConversationByRequestId(requestId string) (*ConversationRecord, error) {
	if requestId == "" {
		return nil, errors.New("request_id is required")
	}
	var rec ConversationRecord
	err := DB.Where("request_id = ?", requestId).Order("id desc").First(&rec).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &rec, nil
}

func GetConversationByRequestIdAndUserId(requestId string, userId int) (*ConversationRecord, error) {
	if requestId == "" {
		return nil, errors.New("request_id is required")
	}
	if userId <= 0 {
		return nil, errors.New("user_id is required")
	}
	var rec ConversationRecord
	err := DB.Where("request_id = ? AND user_id = ?", requestId, userId).Order("id desc").First(&rec).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &rec, nil
}

