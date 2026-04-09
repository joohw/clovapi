package router

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

func SetWebRouter(router *gin.Engine, buildFS embed.FS, indexPage []byte) {
	router.Use(gzip.Gzip(gzip.DefaultCompression))
	router.Use(middleware.GlobalWebRateLimit())
	router.Use(middleware.Cache())

	// Register explicit routes for SvelteKit output dirs. Relying only on gin-contrib/static middleware
	// + NoRoute can miss hashed chunks in some cases; Gin's StaticFS matches /_app/* before NoRoute.
	buildRoot, err := fs.Sub(buildFS, "web/build")
	if err != nil {
		panic(err)
	}
	if sub, err := fs.Sub(buildRoot, "_app"); err == nil {
		router.StaticFS("/_app", http.FS(sub))
	}
	if sub, err := fs.Sub(buildRoot, "user"); err == nil {
		router.StaticFS("/user", http.FS(sub))
	}

	router.Use(static.Serve("/", common.EmbedFolder(buildFS, "web/build")))
	router.NoRoute(func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "web")
		if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") || strings.HasPrefix(c.Request.RequestURI, "/assets") {
			controller.RelayNotFound(c)
			return
		}
		// Missing SvelteKit build chunks must not fall back to index.html — the browser expects
		// application/javascript and would report a MIME error (see strict module script checks).
		if strings.HasPrefix(c.Request.URL.Path, "/_app/") {
			c.Data(http.StatusNotFound, "text/plain; charset=utf-8", []byte("not found"))
			return
		}
		c.Header("Cache-Control", "no-cache")
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexPage)
	})
}
