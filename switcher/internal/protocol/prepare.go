package protocol

import (
	"fmt"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

// PrepareUpstreamRequest mirrors electron/protocol/pipeline.prepareUpstreamRequest for JSON bodies.
func PrepareUpstreamRequest(ingress, egress apistyle.Style, body []byte, hints UpstreamHints) (upstreamJSON []byte, ir Request, pathSuffix string, err error) {
	if ShouldPassthroughOpenAIResponsesWire(ingress, egress) {
		return preparePassthroughOpenAIResponsesRequest(body, hints)
	}
	ir, err = DecodeRequestForStyle(ingress, body)
	if err != nil {
		return nil, Request{}, "", err
	}
	GatewayEnrich(&ir, hints)
	if strings.TrimSpace(ir.Model) == "" {
		return nil, Request{}, "", fmt.Errorf("missing model (set in body or upstream config)")
	}
	pathSuffix = ResolveUpstreamPath(egress, ir, hints.Source)
	upstreamJSON, err = EncodeRequestForStyle(egress, ir)
	if err != nil {
		return nil, Request{}, "", err
	}
	return upstreamJSON, ir, pathSuffix, nil
}
