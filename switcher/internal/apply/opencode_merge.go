package apply

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/tidwall/jsonc"
)

// loadOpenCodeGlobalMerged merges global files in the same order as upstream
// packages/opencode/src/config/config.ts loadGlobal:
// config.json → opencode.json → opencode.jsonc (later layers override / deep-merge).
func loadOpenCodeGlobalMerged(dir string) (map[string]any, error) {
	root := map[string]any{}
	for _, name := range []string{"config.json", "opencode.json", "opencode.jsonc"} {
		p := filepath.Join(dir, name)
		chunk, err := readOpenCodeJSONLikeFile(p)
		if err != nil {
			return nil, err
		}
		if len(chunk) == 0 {
			continue
		}
		root = deepMergeJSON(root, chunk)
	}
	return root, nil
}

func readOpenCodeJSONLikeFile(p string) (map[string]any, error) {
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	if len(strings.TrimSpace(string(data))) == 0 {
		return nil, nil
	}
	if strings.EqualFold(filepath.Ext(p), ".jsonc") {
		data = jsonc.ToJSON(data)
	}
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse %s: %w", p, err)
	}
	return m, nil
}

func deepMergeJSON(dst, src map[string]any) map[string]any {
	if dst == nil {
		dst = map[string]any{}
	}
	for k, v := range src {
		if v == nil {
			dst[k] = nil
			continue
		}
		if dv, ok := dst[k]; ok {
			if dm, ok1 := dv.(map[string]any); ok1 && dm != nil {
				if sm, ok2 := v.(map[string]any); ok2 && sm != nil {
					dst[k] = deepMergeJSON(dm, sm)
					continue
				}
			}
		}
		dst[k] = v
	}
	return dst
}
