package router

import (
	"embed"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

const defaultFrontendBaseURL = "http://127.0.0.1:3000"

func SetRouter(router *gin.Engine, buildFS embed.FS, indexPage []byte) {
	SetApiRouter(router)
	SetDashboardRouter(router)
	SetRelayRouter(router)
	SetVideoRouter(router)
	router.GET("/api.json", controller.GetModelSpec)
	router.GET("/api.ex.json", controller.GetModelSpecEx)
	_ = buildFS
	_ = indexPage

	frontendBaseUrl := strings.TrimSuffix(os.Getenv("FRONTEND_BASE_URL"), "/")
	if frontendBaseUrl == "" {
		frontendBaseUrl = defaultFrontendBaseURL
		common.SysLog(fmt.Sprintf("FRONTEND_BASE_URL is empty, fallback to %s", frontendBaseUrl))
	}
	if common.IsMasterNode {
		common.SysLog("master node keeps external frontend routing enabled")
	}

	router.NoRoute(func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "web")
		c.Redirect(http.StatusMovedPermanently, fmt.Sprintf("%s%s", frontendBaseUrl, c.Request.RequestURI))
	})
}
