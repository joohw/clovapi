package middleware

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"time"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
)

const dbPreviewCaptureBytes = 10 << 20 // keep up to 10MB in DB for durable preview/parsing

const ginKeyConversationStore = "conversation_store_enabled"

type captureWriter struct {
	gin.ResponseWriter
	limit     int
	buf       bytes.Buffer
	truncated bool

	// When limit <= 0, we spool full response to file.
	filePath string
	file     *os.File
}

func (w *captureWriter) Write(p []byte) (int, error) {
	if w.limit <= 0 {
		if w.file != nil {
			_, _ = w.file.Write(p)
		}
		return w.ResponseWriter.Write(p)
	}
	if w.limit > 0 && !w.truncated {
		remain := w.limit - w.buf.Len()
		if remain > 0 {
			if len(p) <= remain {
				_, _ = w.buf.Write(p)
			} else {
				_, _ = w.buf.Write(p[:remain])
				w.truncated = true
			}
		} else {
			w.truncated = true
		}
	}
	return w.ResponseWriter.Write(p)
}

func (w *captureWriter) Close() error {
	if w.file != nil {
		err := w.file.Close()
		w.file = nil
		return err
	}
	return nil
}

func shouldStorePath(cfg *operation_setting.ConversationStoreSetting, path string) bool {
	if cfg == nil {
		return false
	}
	for _, ex := range cfg.ExcludePaths {
		if strings.TrimSpace(ex) != "" && ex == path {
			return false
		}
	}
	if len(cfg.IncludePaths) == 0 {
		return true
	}
	for _, in := range cfg.IncludePaths {
		if strings.TrimSpace(in) != "" && in == path {
			return true
		}
	}
	return false
}

func redactHeaders(h map[string][]string) map[string][]string {
	if h == nil {
		return map[string][]string{}
	}
	out := make(map[string][]string, len(h))
	for k, v := range h {
		kl := strings.ToLower(strings.TrimSpace(k))
		if kl == "authorization" || kl == "x-api-key" || kl == "api-key" || strings.Contains(kl, "token") || strings.Contains(kl, "secret") {
			continue
		}
		out[k] = v
	}
	return out
}

// ConversationStore captures request+response pairs for training.
// Must be registered AFTER BodyStorageCleanup so it can read the body before cleanup runs.
func ConversationStore() gin.HandlerFunc {
	rand.Seed(time.Now().UnixNano())
	return func(c *gin.Context) {
		cfg := operation_setting.GetConversationStoreSetting()
		if cfg == nil || !cfg.Enabled {
			c.Next()
			return
		}
		if cfg.SampleRate > 0 && cfg.SampleRate < 1.0 {
			if rand.Float64() > cfg.SampleRate {
				c.Next()
				return
			}
		}

		path := ""
		if c.Request != nil && c.Request.URL != nil {
			path = c.Request.URL.Path
		}
		if !shouldStorePath(cfg, path) {
			c.Next()
			return
		}

		// Wrap writer to capture outgoing bytes (what client receives).
		limit := cfg.MaxCaptureBytes
		cw := &captureWriter{ResponseWriter: c.Writer, limit: limit}
		if limit <= 0 {
			p, f, err := common.CreateDiskCacheFile(common.DiskCacheTypeFile)
			if err == nil {
				cw.filePath = p
				cw.file = f
			} else {
				// If we cannot spool, fall back to 1MB in-memory cap to avoid OOM.
				cw.limit = 1 << 20
			}
		}
		c.Writer = cw

		// Run handlers
		c.Set(ginKeyConversationStore, true)
		c.Next()
		_ = cw.Close()

		// Capture request body from BodyStorage (best-effort).
		var reqBody []byte
		reqBodyPath := ""
		reqTruncated := false
		if storage, err := common.GetBodyStorage(c); err == nil && storage != nil {
			if limit <= 0 {
				if p, err := writeBodyStorageToDisk(storage); err == nil {
					reqBodyPath = p
				}
			} else {
				if b, bErr := storage.Bytes(); bErr == nil {
					if len(b) > limit {
						reqBody = b[:limit]
						reqTruncated = true
					} else {
						reqBody = b
					}
				}
			}
		}

		respBody := cw.buf.Bytes()
		respBodyPath := cw.filePath
		respTruncated := cw.truncated

		// When running in spool-to-disk mode (limit<=0), also persist a bounded DB preview.
		if len(reqBody) == 0 && reqBodyPath != "" {
			if b, truncated, err := readFilePreview(reqBodyPath, dbPreviewCaptureBytes); err == nil {
				reqBody = b
				if truncated {
					reqTruncated = true
				}
			}
		}
		if len(respBody) == 0 && respBodyPath != "" {
			if b, truncated, err := readFilePreview(respBodyPath, dbPreviewCaptureBytes); err == nil {
				respBody = b
				if truncated {
					respTruncated = true
				}
			}
		}

		// Basic metadata from context (set by auth / distribute).
		userID := c.GetInt("id")
		username := c.GetString("username")
		tokenID := c.GetInt("token_id")
		tokenName := c.GetString("token_name")
		modelName := c.GetString("original_model")
		channelID := c.GetInt("channel_id")
		channelType := c.GetInt("channel_type")
		requestID := c.GetString(common.RequestIdKey)

		isStream := false
		ct := c.Writer.Header().Get("Content-Type")
		if strings.HasPrefix(ct, "text/event-stream") {
			isStream = true
		}

		other := map[string]any{
			"request_headers":  redactHeaders(c.Request.Header),
			"response_headers": redactHeaders(c.Writer.Header()),
			"user_agent":       c.Request.UserAgent(),
		}
		otherStr := "{}"
		if cfg.RedactSensitive {
			// Best-effort: headers already redacted; body redaction is intentionally minimal.
		}
		if b, err := common.Marshal(other); err == nil {
			otherStr = string(b)
		}

		rec := &model.ConversationRecord{
			CreatedAt:          common.GetTimestamp(),
			UserId:             userID,
			TokenId:            tokenID,
			Username:           username,
			TokenName:          tokenName,
			RequestId:          requestID,
			Path:               path,
			Method:             c.Request.Method,
			ModelName:          modelName,
			ChannelId:          channelID,
			ChannelType:        channelType,
			StatusCode:         c.Writer.Status(),
			IsStream:           isStream,
			RequestBody:        string(reqBody),
			ResponseBody:       string(respBody),
			RequestBodyPath:    reqBodyPath,
			ResponseBodyPath:   respBodyPath,
			RequestTruncated:   reqTruncated,
			ResponseTruncated:  respTruncated,
			Other:              otherStr,
		}

		mode := strings.TrimSpace(strings.ToLower(cfg.Mode))
		if mode == "" {
			mode = "db"
		}

		gopool.Go(func() {
			switch mode {
			case "db":
				model.RecordConversation(rec)
			case "file":
				// Keep a DB index row even in file mode so UI can query by request_id.
				model.RecordConversation(rec)
				_ = writeConversationToFile(cfg.FileDir, rec)
			case "db_and_file":
				model.RecordConversation(rec)
				_ = writeConversationToFile(cfg.FileDir, rec)
			default:
				model.RecordConversation(rec)
			}
		})
	}
}

func writeConversationToFile(dir string, rec *model.ConversationRecord) error {
	if rec == nil {
		return nil
	}
	if strings.TrimSpace(dir) == "" {
		dir = "./data/conversations"
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	// One JSON per line for easy streaming ingest.
	lineBytes, err := common.Marshal(rec)
	if err != nil {
		return err
	}
	filename := fmt.Sprintf("conversations-%s.jsonl", time.Now().Format("20060102"))
	path := filepath.Join(dir, filename)
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer f.Close()
	w := bufio.NewWriterSize(f, 64*1024)
	if _, err := w.Write(lineBytes); err != nil {
		return err
	}
	if _, err := w.Write([]byte("\n")); err != nil {
		return err
	}
	return w.Flush()
}

func writeBodyStorageToDisk(storage common.BodyStorage) (string, error) {
	if storage == nil {
		return "", nil
	}
	if _, err := storage.Seek(0, 0); err != nil {
		return "", err
	}
	filePath, file, err := common.CreateDiskCacheFile(common.DiskCacheTypeBody)
	if err != nil {
		return "", err
	}
	defer func() {
		_ = file.Close()
	}()
	// Copy without loading into memory.
	if _, err := io.Copy(file, storage); err != nil {
		_ = os.Remove(filePath)
		return "", err
	}
	_, _ = storage.Seek(0, 0)
	return filePath, nil
}

func readFilePreview(path string, maxBytes int) ([]byte, bool, error) {
	if strings.TrimSpace(path) == "" || maxBytes <= 0 {
		return nil, false, nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, false, err
	}
	defer f.Close()
	buf, err := io.ReadAll(io.LimitReader(f, int64(maxBytes+1)))
	if err != nil {
		return nil, false, err
	}
	if len(buf) > maxBytes {
		return buf[:maxBytes], true, nil
	}
	return buf, false, nil
}

