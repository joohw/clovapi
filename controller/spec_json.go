package controller

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

const (
	modelSpecFilePath   = "web/static/api.json"
	modelSpecExFilePath = "web/static/api.ex.json"
)

func GetModelSpec(c *gin.Context) {
	serveJSONFile(c, modelSpecFilePath)
}

func GetModelSpecEx(c *gin.Context) {
	serveJSONFile(c, modelSpecExFilePath)
}

func serveJSONFile(c *gin.Context, filePath string) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		c.Data(http.StatusOK, "application/json; charset=utf-8", []byte("{}"))
		return
	}
	c.Data(http.StatusOK, "application/json; charset=utf-8", data)
}
