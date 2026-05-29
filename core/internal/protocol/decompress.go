package protocol

import (
	"bytes"
	"compress/gzip"
	compresszlib "compress/zlib"
	"fmt"
	"io"
	"strings"

	"github.com/andybalholm/brotli"
)

// DecodeCompressedResponseBody decompresses gzip/deflate/brotli when Content-Encoding declares it (Electron proxy-response-headers).
func DecodeCompressedResponseBody(contentEncoding string, raw []byte) ([]byte, error) {
	raw = bytes.Clone(raw)
	ce := strings.ToLower(strings.TrimSpace(contentEncoding))
	if len(raw) == 0 {
		return raw, nil
	}
	switch {
	case strings.Contains(ce, "gzip"):
		r, err := gzip.NewReader(bytes.NewReader(raw))
		if err != nil {
			return nil, fmt.Errorf("gzip: %w", err)
		}
		defer r.Close()
		out, err := io.ReadAll(io.LimitReader(r, MaxDownstreamWireBytes))
		if err != nil {
			return nil, fmt.Errorf("gzip read: %w", err)
		}
		return out, nil
	case strings.Contains(ce, "deflate"):
		zr, err := compresszlib.NewReader(bytes.NewReader(raw))
		if err != nil {
			return nil, fmt.Errorf("deflate: %w", err)
		}
		defer zr.Close()
		out, err := io.ReadAll(io.LimitReader(zr, MaxDownstreamWireBytes))
		if err != nil {
			return nil, fmt.Errorf("deflate read: %w", err)
		}
		return out, nil
	case strings.Contains(ce, "br"):
		r := brotli.NewReader(bytes.NewReader(raw))
		out, err := io.ReadAll(io.LimitReader(r, MaxDownstreamWireBytes))
		if err != nil {
			return nil, fmt.Errorf("br read: %w", err)
		}
		return out, nil
	default:
		return raw, nil
	}
}

// WrapStreamingPlaintextReader returns plaintext bytes for chunked SSE decoding (streaming gzip/deflate/br like Electron pipeline).
//
// Call cleanup exactly once — it tears down compressed layers and closes the originating HTTP response body.
func WrapStreamingPlaintextReader(contentEncoding string, body io.ReadCloser) (plaintext io.Reader, cleanup func()) {
	if body == nil {
		return eofReader{}, func() {}
	}
	ce := strings.ToLower(strings.TrimSpace(contentEncoding))
	switch {
	case strings.Contains(ce, "gzip"):
		gr, err := gzip.NewReader(body)
		if err != nil {
			return &errorReader{err: err}, func() { _ = body.Close() }
		}
		return limitStreamingReader(gr), func() {
			_ = gr.Close()
			_ = body.Close()
		}
	case strings.Contains(ce, "deflate"):
		zr, err := compresszlib.NewReader(body)
		if err != nil {
			return &errorReader{err: err}, func() { _ = body.Close() }
		}
		return limitStreamingReader(zr), func() {
			_ = zr.Close()
			_ = body.Close()
		}
	case strings.Contains(ce, "br"):
		br := brotli.NewReader(body)
		return limitStreamingReader(br), func() { _ = body.Close() }
	default:
		return body, func() { _ = body.Close() }
	}
}

// limitStreamingReader bounds the total number of decompressed bytes read from a
// streaming compressed body. Without this, a malicious or buggy upstream can
// stream a compression bomb through the SSE transcoder (and the call-log
// capture buffer), exhausting memory/CPU. The cap is far larger than any
// legitimate single model response.
func limitStreamingReader(r io.Reader) io.Reader {
	return io.LimitReader(r, MaxStreamingWireBytes)
}

type eofReader struct{}

func (eofReader) Read(p []byte) (int, error) { return 0, io.EOF }

type errorReader struct{ err error }

func (e *errorReader) Read([]byte) (int, error) { return 0, e.err }

// MaxDownstreamWireBytes bounds response material after buffered decompression (~64Mi).
const MaxDownstreamWireBytes int64 = 1 << 26

// MaxStreamingWireBytes bounds the total decompressed bytes consumed from a single
// streaming (SSE) response (~256Mi). It guards against compression bombs while
// staying well above any legitimate single response stream.
const MaxStreamingWireBytes int64 = 1 << 28
