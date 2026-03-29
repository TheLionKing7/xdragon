/**
 * PLACE AT: xdragon/app/ui/app/src/lib/ollama-client.ts
 *
 * Thin wrapper around the ollama/browser client.
 * Install: npm install ollama
 */
import { Ollama } from "ollama/browser";

export const ollamaClient = new Ollama({
  host: "http://localhost:11434",
});
