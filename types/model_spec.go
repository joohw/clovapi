// Package types — ModelSpec aligns with the public model catalog schema at
// https://models.dev/ (source: https://github.com/anomalyco/models.dev, packages/core/src/schema.ts).
// Stored as JSON on model.Model.ModelSpec; informational only — billing remains in ratio/USD settings.

package types

// ModalityKind matches models.dev modality enum values.
type ModalityKind string

const (
	ModalityText  ModalityKind = "text"
	ModalityAudio ModalityKind = "audio"
	ModalityImage ModalityKind = "image"
	ModalityVideo ModalityKind = "video"
	ModalityPDF   ModalityKind = "pdf"
)

// ModelSpecModalities mirrors models.dev modalities: input/output token modalities.
type ModelSpecModalities struct {
	Input  []ModalityKind `json:"input,omitempty"`
	Output []ModalityKind `json:"output,omitempty"`
}

// ModelSpecLimit mirrors models.dev limit (token windows).
type ModelSpecLimit struct {
	Context *int `json:"context,omitempty"`
	Input   *int `json:"input,omitempty"`
	Output  *int `json:"output,omitempty"`
}

// ModelSpecCost mirrors models.dev cost (USD per 1M tokens); reference pricing, not gateway billing.
type ModelSpecCost struct {
	Input             *float64 `json:"input,omitempty"`
	Output            *float64 `json:"output,omitempty"`
	Reasoning         *float64 `json:"reasoning,omitempty"`
	CacheRead         *float64 `json:"cache_read,omitempty"`
	CacheWrite        *float64 `json:"cache_write,omitempty"`
	InputAudio        *float64 `json:"input_audio,omitempty"`
	OutputAudio       *float64 `json:"output_audio,omitempty"`
	ContextOver200k   *float64 `json:"context_over_200k,omitempty"`
}

// ModelSpec is a subset of the models.dev Model object suitable for persistence and import/export.
type ModelSpec struct {
	// ID is the canonical AI SDK / models.dev model id when known.
	ID   string `json:"id,omitempty"`
	Name string `json:"name,omitempty"`
	// Family groups variants (e.g. gpt-5 family).
	Family string `json:"family,omitempty"`

	Attachment        *bool `json:"attachment,omitempty"`
	Reasoning         *bool `json:"reasoning,omitempty"`
	ToolCall          *bool `json:"tool_call,omitempty"`
	StructuredOutput  *bool `json:"structured_output,omitempty"`
	Temperature       *bool `json:"temperature,omitempty"`
	Interleaved       *bool `json:"interleaved,omitempty"`

	Modalities *ModelSpecModalities `json:"modalities,omitempty"`
	Limit      *ModelSpecLimit      `json:"limit,omitempty"`
	Cost       *ModelSpecCost       `json:"cost,omitempty"`

	Knowledge    string `json:"knowledge,omitempty"`
	ReleaseDate  string `json:"release_date,omitempty"`
	LastUpdated  string `json:"last_updated,omitempty"`
	OpenWeights  *bool  `json:"open_weights,omitempty"`

	// Status: alpha | beta | deprecated (optional).
	Status string `json:"status,omitempty"`
}
