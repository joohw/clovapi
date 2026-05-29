package protocol

import (
	"fmt"
	"strings"
)

// decodeContentParts parses a wire message "content" value into normalized IR
// content parts. It recognizes the text and image shapes used by the Claude,
// OpenAI Chat, OpenAI Responses, and Gemini wire formats. hasImage reports
// whether any non-text (image) part was found; when false callers should keep
// using the plain-string Content path so text-only behavior is unchanged.
func decodeContentParts(value any) (parts []ContentPart, hasImage bool) {
	arr, ok := value.([]any)
	if !ok {
		return nil, false
	}
	for _, raw := range arr {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		// Gemini-style inline/file data is not tagged with a "type" field.
		if img := geminiImagePart(item); img != nil {
			parts = append(parts, ContentPart{Type: "image", Image: img})
			hasImage = true
			continue
		}
		typ := ""
		if item["type"] != nil {
			typ = strings.ToLower(strings.TrimSpace(fmt.Sprint(item["type"])))
		}
		switch typ {
		case "text", "input_text", "output_text", "":
			// "" covers Gemini-style untyped text parts ({"text":"..."}).
			if t, ok := item["text"].(string); ok && t != "" {
				parts = append(parts, ContentPart{Type: "text", Text: t})
			}
		case "image_url":
			if img := openAIImageURLPart(item["image_url"]); img != nil {
				parts = append(parts, ContentPart{Type: "image", Image: img})
				hasImage = true
			}
		case "input_image", "output_image":
			if img := responsesImagePart(item); img != nil {
				parts = append(parts, ContentPart{Type: "image", Image: img})
				hasImage = true
			}
		case "image":
			if img := claudeImagePart(item["source"]); img != nil {
				parts = append(parts, ContentPart{Type: "image", Image: img})
				hasImage = true
			}
		}
	}
	return parts, hasImage
}

func openAIImageURLPart(value any) *ImageSource {
	switch v := value.(type) {
	case string:
		if u := strings.TrimSpace(v); u != "" {
			return imageSourceFromURL(u)
		}
	case map[string]any:
		if u := strings.TrimSpace(fmt.Sprint(v["url"])); u != "" && u != "<nil>" {
			return imageSourceFromURL(u)
		}
	}
	return nil
}

func responsesImagePart(item map[string]any) *ImageSource {
	if u := strings.TrimSpace(fmt.Sprint(item["image_url"])); u != "" && u != "<nil>" {
		return imageSourceFromURL(u)
	}
	return nil
}

func claudeImagePart(value any) *ImageSource {
	src, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	switch strings.ToLower(strings.TrimSpace(fmt.Sprint(src["type"]))) {
	case "url":
		if u := strings.TrimSpace(fmt.Sprint(src["url"])); u != "" && u != "<nil>" {
			return imageSourceFromURL(u)
		}
	default: // base64
		data := strings.TrimSpace(fmt.Sprint(src["data"]))
		if data == "" || data == "<nil>" {
			return nil
		}
		return &ImageSource{
			MediaType: strings.TrimSpace(fmt.Sprint(src["media_type"])),
			Data:      data,
		}
	}
	return nil
}

func geminiImagePart(item map[string]any) *ImageSource {
	if inline, ok := item["inlineData"].(map[string]any); ok && inline != nil {
		data := strings.TrimSpace(fmt.Sprint(inline["data"]))
		if data != "" && data != "<nil>" {
			return &ImageSource{
				MediaType: strings.TrimSpace(fmt.Sprint(inline["mimeType"])),
				Data:      data,
			}
		}
	}
	if file, ok := item["fileData"].(map[string]any); ok && file != nil {
		if u := strings.TrimSpace(fmt.Sprint(file["fileUri"])); u != "" && u != "<nil>" {
			return &ImageSource{URL: u, MediaType: strings.TrimSpace(fmt.Sprint(file["mimeType"]))}
		}
	}
	return nil
}

// imageSourceFromURL normalizes a URL into an ImageSource, splitting inline
// data: URLs into media type + base64 so downstream encoders can pick the
// representation their wire format requires.
func imageSourceFromURL(u string) *ImageSource {
	if mediaType, data, ok := parseDataURL(u); ok {
		return &ImageSource{MediaType: mediaType, Data: data}
	}
	return &ImageSource{URL: u}
}

// parseDataURL extracts the media type and base64 payload from a
// "data:<media>;base64,<data>" URL. ok is false for non-data or non-base64 URLs.
func parseDataURL(u string) (mediaType, data string, ok bool) {
	if !strings.HasPrefix(u, "data:") {
		return "", "", false
	}
	rest := u[len("data:"):]
	comma := strings.IndexByte(rest, ',')
	if comma < 0 {
		return "", "", false
	}
	meta := rest[:comma]
	payload := rest[comma+1:]
	if !strings.Contains(strings.ToLower(meta), "base64") {
		return "", "", false
	}
	mediaType = strings.TrimSpace(strings.SplitN(meta, ";", 2)[0])
	return mediaType, strings.TrimSpace(payload), true
}

// imageDataURL renders an ImageSource as a data: URL (used by formats that only
// accept a single URL string). Falls back to the plain URL when no inline data.
func imageDataURL(img *ImageSource) string {
	if img == nil {
		return ""
	}
	if img.Data != "" {
		mt := strings.TrimSpace(img.MediaType)
		if mt == "" {
			mt = "image/png"
		}
		return "data:" + mt + ";base64," + img.Data
	}
	return img.URL
}

// messageHasImage reports whether a message carries any image content part.
func messageHasImage(m Message) bool {
	for _, p := range m.Parts {
		if p.Type == "image" && p.Image != nil {
			return true
		}
	}
	return false
}

// openAIChatContentValue returns the wire "content" for an OpenAI Chat message:
// a plain string when there are no image parts, otherwise a content-part array.
func openAIChatContentValue(m Message) any {
	if !messageHasImage(m) {
		return m.Content
	}
	out := make([]map[string]any, 0, len(m.Parts))
	for _, p := range m.Parts {
		switch p.Type {
		case "text":
			out = append(out, map[string]any{"type": "text", "text": p.Text})
		case "image":
			if p.Image != nil {
				out = append(out, map[string]any{
					"type":      "image_url",
					"image_url": map[string]any{"url": imageDataURL(p.Image)},
				})
			}
		}
	}
	return out
}

// claudeContentBlocks returns Anthropic content blocks for a message and whether
// it contained an image (callers fall back to a plain string when false).
func claudeContentBlocks(m Message) ([]map[string]any, bool) {
	if !messageHasImage(m) {
		return nil, false
	}
	out := make([]map[string]any, 0, len(m.Parts))
	for _, p := range m.Parts {
		switch p.Type {
		case "text":
			if strings.TrimSpace(p.Text) != "" {
				out = append(out, map[string]any{"type": "text", "text": p.Text})
			}
		case "image":
			if p.Image != nil {
				out = append(out, claudeImageBlock(p.Image))
			}
		}
	}
	return out, true
}

func claudeImageBlock(img *ImageSource) map[string]any {
	if img.Data == "" && img.URL != "" {
		if mt, data, ok := parseDataURL(img.URL); ok {
			img = &ImageSource{MediaType: mt, Data: data}
		} else {
			return map[string]any{
				"type":   "image",
				"source": map[string]any{"type": "url", "url": img.URL},
			}
		}
	}
	mt := strings.TrimSpace(img.MediaType)
	if mt == "" {
		mt = "image/png"
	}
	return map[string]any{
		"type": "image",
		"source": map[string]any{
			"type":       "base64",
			"media_type": mt,
			"data":       img.Data,
		},
	}
}

// responsesContentParts returns OpenAI Responses content parts and whether the
// message contained an image.
func responsesContentParts(m Message) ([]map[string]any, bool) {
	if !messageHasImage(m) {
		return nil, false
	}
	textType := responsesMessageContentType(m.Role)
	out := make([]map[string]any, 0, len(m.Parts))
	for _, p := range m.Parts {
		switch p.Type {
		case "text":
			out = append(out, map[string]any{"type": textType, "text": p.Text})
		case "image":
			if p.Image != nil {
				out = append(out, map[string]any{"type": "input_image", "image_url": imageDataURL(p.Image)})
			}
		}
	}
	return out, true
}
