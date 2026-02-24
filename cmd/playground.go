package playground

import (
	"context"
	"fmt"
	"math"
	"math/rand"
	"os"
	"time"

	"github.com/ollama/ollama/api"
	"github.com/spf13/cobra"
)

const (
	maxRetries     = 3
	baseBackoff    = 500 * time.Millisecond
	maxBackoff     = 10 * time.Second
	requestTimeout = 5 * time.Minute
)

// retryWithBackoff retries fn up to maxRetries with exponential back-off + jitter.
func retryWithBackoff(fn func() error) error {
	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		lastErr = fn()
		if lastErr == nil {
			return nil
		}
		if attempt < maxRetries {
			delay := time.Duration(float64(baseBackoff) * math.Pow(2, float64(attempt)))
			if delay > maxBackoff {
				delay = maxBackoff
			}
			jitter := time.Duration(rand.Int63n(int64(200 * time.Millisecond)))
			fmt.Fprintf(os.Stderr, "⟳ Attempt %d/%d failed, retrying in %v...\n", attempt+1, maxRetries, delay+jitter)
			time.Sleep(delay + jitter)
		}
	}
	return fmt.Errorf("after %d retries: %w", maxRetries, lastErr)
}

// healthCheck verifies the Ollama server is reachable.
func healthCheck(client *api.Client) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return client.Heartbeat(ctx)
}

// NewPlaygroundCmd returns a cobra.Command for the creative coding playground.
func NewPlaygroundCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "playground",
		Short: "Creative coding playground — run prompts from the CLI",
		Long: `The playground lets you quickly test models from the terminal.

Examples:
  ollama playground -m llama3 -p "Write a Python quicksort"
  ollama playground -m deepseek-r1 -p "Explain monads" --stream
  ollama playground -m llama3 -p "Review this code" --temp 0.2`,
		RunE: runPlayground,
	}

	cmd.Flags().StringP("model", "m", "", "Model name (required)")
	cmd.Flags().StringP("prompt", "p", "", "Prompt text (required)")
	cmd.Flags().BoolP("stream", "s", false, "Stream output token-by-token")
	cmd.Flags().Float64("temp", 0.7, "Sampling temperature (0.0–2.0)")
	cmd.Flags().IntP("retries", "r", maxRetries, "Max retry attempts on failure")

	return cmd
}

func runPlayground(cmd *cobra.Command, args []string) error {
	model, _ := cmd.Flags().GetString("model")
	prompt, _ := cmd.Flags().GetString("prompt")
	stream, _ := cmd.Flags().GetBool("stream")
	temp, _ := cmd.Flags().GetFloat64("temp")

	// --- Input validation ---
	if model == "" {
		return fmt.Errorf("--model (-m) is required")
	}
	if prompt == "" {
		return fmt.Errorf("--prompt (-p) is required")
	}
	if temp < 0 || temp > 2 {
		return fmt.Errorf("--temp must be between 0.0 and 2.0, got %.1f", temp)
	}

	// --- Create client ---
	client, err := api.ClientFromEnvironment()
	if err != nil {
		return fmt.Errorf("failed to create API client: %w", err)
	}

	// --- Health check with retry ---
	fmt.Fprint(os.Stderr, "⚡ Checking server health... ")
	if err := retryWithBackoff(func() error { return healthCheck(client) }); err != nil {
		fmt.Fprintln(os.Stderr, "✗")
		return fmt.Errorf("server unreachable: %w", err)
	}
	fmt.Fprintln(os.Stderr, "✓")

	// --- Generate ---
	ctx, cancel := context.WithTimeout(context.Background(), requestTimeout)
	defer cancel()

	req := &api.GenerateRequest{
		Model:  model,
		Prompt: prompt,
		Stream: &stream,
		Options: map[string]interface{}{
			"temperature": temp,
		},
	}

	fmt.Fprintf(os.Stderr, "🧠 Model: %s | Temp: %.1f | Stream: %v\n", model, temp, stream)
	fmt.Fprintln(os.Stderr, "─────────────────────────────────────────")

	var fullResponse string
	err = retryWithBackoff(func() error {
		fullResponse = "" // reset on retry
		return client.Generate(ctx, req, func(resp api.GenerateResponse) error {
			if stream {
				fmt.Print(resp.Response)
			} else {
				fullResponse += resp.Response
			}
			return nil
		})
	})
	if err != nil {
		return fmt.Errorf("generation failed: %w", err)
	}

	if !stream {
		fmt.Println(fullResponse)
	} else {
		fmt.Println() // trailing newline after streamed tokens
	}

	fmt.Fprintln(os.Stderr, "─────────────────────────────────────────")
	fmt.Fprintln(os.Stderr, "✓ Done")
	return nil
}
