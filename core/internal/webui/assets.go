// Package webui contains the Vite application embedded in the CLI binary.
package webui

import (
	"embed"
	"io/fs"
)

//go:embed missing.html
var MissingPage []byte

// Build with npm run build:web before compiling a distributable binary.
//
//go:embed all:dist
var assets embed.FS

func Assets() fs.FS {
	f, err := fs.Sub(assets, "dist")
	if err != nil {
		panic(err)
	}
	return f
}
