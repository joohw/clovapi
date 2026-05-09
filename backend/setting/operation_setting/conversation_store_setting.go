package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// ConversationStoreSetting stores request/response pairs for offline training.
//
// Notes:
// - Default is disabled (privacy + performance).
// - When max_capture_bytes <= 0, bodies are stored to files (no truncation).
type ConversationStoreSetting struct {
	Enabled bool `json:"enabled"`

	// Mode: "db" | "file" | "db_and_file"
	Mode string `json:"mode"`

	// SampleRate: 0.0~1.0
	SampleRate float64 `json:"sample_rate"`

	// MaxCaptureBytes caps how many bytes to persist per request/response body (after capture).
	// When <= 0, it will not truncate; request/response bodies are written to files instead of memory buffers.
	MaxCaptureBytes int `json:"max_capture_bytes"`

	// IncludePaths / ExcludePaths are exact-match path filters (e.g. "/v1/chat/completions").
	IncludePaths []string `json:"include_paths"`
	ExcludePaths []string `json:"exclude_paths"`

	// FileDir is used when Mode contains "file".
	FileDir string `json:"file_dir"`

	// RedactSensitive tries to remove obvious secrets from headers/body before persisting.
	RedactSensitive bool `json:"redact_sensitive"`
}

var conversationStoreSetting = ConversationStoreSetting{
	Enabled:         true,
	Mode:            "db",
	SampleRate:      1.0,
	MaxCaptureBytes: 0, // <= 0 means no truncation (spool to files)
	IncludePaths: []string{
		"/v1/chat/completions",
		"/v1/completions",
		"/v1/responses",
		"/v1/responses/compact",
		"/v1/messages",
		"/pg/chat/completions",
	},
	ExcludePaths:     []string{},
	FileDir:          "./data/conversations",
	RedactSensitive:  true,
}

func init() {
	config.GlobalConfig.Register("conversation_store_setting", &conversationStoreSetting)
}

func GetConversationStoreSetting() *ConversationStoreSetting {
	return &conversationStoreSetting
}

