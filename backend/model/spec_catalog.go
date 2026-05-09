package model

import (
	"os"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const (
	modelSpecCatalogPath   = "web/static/api.json"
	modelSpecCatalogExPath = "web/static/api.ex.json"
	modelSpecCacheTTL      = 20 * time.Second
)

var (
	modelSpecIndex       map[string]map[string]any
	lastModelSpecLoadAt  time.Time
	modelSpecIndexLocker sync.RWMutex
)

func getModelSpecIndex() map[string]map[string]any {
	modelSpecIndexLocker.RLock()
	useCache := len(modelSpecIndex) > 0 && time.Since(lastModelSpecLoadAt) <= modelSpecCacheTTL
	if useCache {
		cached := modelSpecIndex
		modelSpecIndexLocker.RUnlock()
		return cached
	}
	modelSpecIndexLocker.RUnlock()

	modelSpecIndexLocker.Lock()
	defer modelSpecIndexLocker.Unlock()

	if len(modelSpecIndex) > 0 && time.Since(lastModelSpecLoadAt) <= modelSpecCacheTTL {
		return modelSpecIndex
	}

	index := make(map[string]map[string]any)
	mergeModelSpecFile(index, modelSpecCatalogExPath, false)
	mergeModelSpecFile(index, modelSpecCatalogPath, true)
	modelSpecIndex = index
	lastModelSpecLoadAt = time.Now()
	return modelSpecIndex
}

func mergeModelSpecFile(index map[string]map[string]any, filePath string, overwrite bool) {
	file, err := os.Open(filePath)
	if err != nil {
		return
	}
	defer func() { _ = file.Close() }()

	var payload map[string]any
	if err = common.DecodeJson(file, &payload); err != nil {
		return
	}

	for _, providerAny := range payload {
		provider, ok := providerAny.(map[string]any)
		if !ok {
			continue
		}
		modelsAny, ok := provider["models"]
		if !ok {
			continue
		}
		modelsMap, ok := modelsAny.(map[string]any)
		if !ok {
			continue
		}
		for id, specAny := range modelsMap {
			spec, ok := specAny.(map[string]any)
			if !ok {
				continue
			}
			specID := strings.TrimSpace(id)
			if idAny, ok := spec["id"]; ok {
				if idStr, ok := idAny.(string); ok && strings.TrimSpace(idStr) != "" {
					specID = strings.TrimSpace(idStr)
				}
			}
			if specID == "" {
				continue
			}
			if _, exists := index[specID]; exists && !overwrite {
				continue
			}
			index[specID] = spec
		}
	}
}

func findModelSpec(modelName string, index map[string]map[string]any) map[string]any {
	key := strings.TrimSpace(modelName)
	if key == "" {
		return nil
	}
	if spec, ok := index[key]; ok {
		return spec
	}
	if slashIdx := strings.Index(key, "/"); slashIdx > 0 {
		shortKey := key[slashIdx+1:]
		if spec, ok := index[shortKey]; ok {
			return spec
		}
	}
	return nil
}
