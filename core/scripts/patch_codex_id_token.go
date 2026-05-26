//go:build ignore

package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

func main() {
	home, err := os.UserHomeDir()
	if err != nil {
		panic(err)
	}
	path := filepath.Join(home, ".codex", "auth.json")
	data, err := os.ReadFile(path)
	if err != nil {
		panic(err)
	}
	var root map[string]any
	if err := json.Unmarshal(data, &root); err != nil {
		panic(err)
	}
	tokens, _ := root["tokens"].(map[string]any)
	if tokens == nil {
		fmt.Println("no tokens in auth.json")
		return
	}
	if _, ok := tokens["id_token"]; ok {
		fmt.Println("id_token already present")
		return
	}
	if v, ok := tokens["access_token"].(string); ok && v != "" {
		tokens["id_token"] = v
	} else if v, ok := tokens["accessToken"].(string); ok && v != "" {
		tokens["id_token"] = v
	} else {
		panic("no access_token to mirror into id_token")
	}
	out, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		panic(err)
	}
	if err := os.WriteFile(path, append(out, '\n'), 0o600); err != nil {
		panic(err)
	}
	fmt.Println("patched id_token into ~/.codex/auth.json")
}
