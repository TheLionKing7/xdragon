package playground

import (
	"fmt"

	"github.com/spf13/cobra"
)

// NewPlaygroundCmd returns a cobra.Command for the playground CLI
func NewPlaygroundCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "playground",
		Short: "Creative coding playground for models",
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Println("Welcome to the Creative Playground! Use the web UI for full features, or pass --model and --prompt to run a quick test.")
			return nil
		},
	}

	cmd.Flags().StringP("model", "m", "", "Model name to use")
	cmd.Flags().StringP("prompt", "p", "", "Prompt to send to the model")
	cmd.Flags().BoolP("stream", "s", false, "Stream output (default: false)")

	cmd.RunE = func(cmd *cobra.Command, args []string) error {
		model, _ := cmd.Flags().GetString("model")
		prompt, _ := cmd.Flags().GetString("prompt")
		stream, _ := cmd.Flags().GetBool("stream")
		if model == "" || prompt == "" {
			fmt.Println("Please provide both --model and --prompt.")
			return nil
		}
		// TODO: Call API to run model and print output
		fmt.Printf("[Playground] Model: %s\nPrompt: %s\nStream: %v\n", model, prompt, stream)
		return nil
	}

	return cmd
}
