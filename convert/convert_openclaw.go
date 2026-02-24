package convert

import (
	"github.com/ollama/ollama/fs/ggml"
)

type openclawModel struct {
	ModelParameters
	// Add OpenClaw-specific fields here
}

func (m *openclawModel) KV(t *Tokenizer) KV {
	kv := m.ModelParameters.KV(t)
	kv["general.architecture"] = "openclaw"
	// Add OpenClaw-specific key-values here
	return kv
}

func (m *openclawModel) Tensors(ts []Tensor) []*ggml.Tensor {
	out := make([]*ggml.Tensor, 0, len(ts))
	for _, t := range ts {
		out = append(out, &ggml.Tensor{
			Name:     t.Name(),
			Kind:     t.Kind(),
			Shape:    t.Shape(),
			WriterTo: t,
		})
	}
	return out
}

func (m *openclawModel) Replacements() []string {
	// Add OpenClaw-specific replacements if needed
	return nil
}

func (m *openclawModel) specialTokenTypes() []string {
	return m.ModelParameters.specialTokenTypes()
}
