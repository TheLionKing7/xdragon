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
	// Implement NanoClaw-specific tensor mapping here
	return convertTensors(ts)
}

func (m *nanoclawModel) Replacements() []string {
	// Add NanoClaw-specific replacements if needed
	return nil
}

func (m *nanoclawModel) specialTokenTypes() []string {
	return m.ModelParameters.specialTokenTypes()
}
