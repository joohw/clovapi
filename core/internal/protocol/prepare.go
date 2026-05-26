package protocol

import (
	"fmt"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
)

// PrepareOptions carries proxy-owned request adjustments into the protocol
// decode/encode step without making protocol decide upstream routing policy.
type PrepareOptions struct {
	Model       string
	ForceStream bool
	Configure   func(*Request)
}

// PrepareUpstreamRequest decodes ingress JSON into IR, applies caller-provided
// request policy, then encodes the IR for the selected egress API style.
func PrepareUpstreamRequest(ingress, egress apistyle.Style, body []byte, opts PrepareOptions) (upstreamJSON []byte, ir Request, err error) {
	ir, err = DecodeRequestForStyle(ingress, body)
	if err != nil {
		return nil, Request{}, err
	}
	model := strings.TrimSpace(opts.Model)
	if model != "" {
		ir.Model = model
	}
	if opts.ForceStream {
		ir.Stream = true
	}
	if opts.Configure != nil {
		opts.Configure(&ir)
	}
	if strings.TrimSpace(ir.Model) == "" {
		return nil, Request{}, fmt.Errorf("missing model (set in body or upstream config)")
	}
	upstreamJSON, err = EncodeRequestForStyle(egress, ir)
	if err != nil {
		return nil, Request{}, err
	}
	return upstreamJSON, ir, nil
}
