package convert

import (
	"github.com/ollama/ollama/fs/ggml"
)

type nanoclawModel struct {
	ModelParameters
	// Add NanoClaw-specific fields here
}

func (m *nanoclawModel) KV(t *Tokenizer) KV {
	kv := m.ModelParameters.KV(t)
	kv["general.architecture"] = "nanoclaw"
	// Add NanoClaw-specific key-values here
	return kv
}

func (m *nanoclawModel) Tensors(ts []Tensor) []*ggml.Tensor {
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

func (m *nanoclawModel) Replacements() []string {
	// Add NanoClaw-specific replacements if needed
	return nil
}

func (m *nanoclawModel) specialTokenTypes() []string {
	return m.ModelParameters.specialTokenTypes()
}
