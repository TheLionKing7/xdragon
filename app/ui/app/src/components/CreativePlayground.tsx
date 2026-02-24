import { useState, useCallback, useRef, useEffect } from "react";
import type { ChangeEvent } from "react";
import { useModels } from "@/hooks/useModels";
import { useHealth } from "@/hooks/useHealth";

// ---------------------------------------------------------------------------
// Retry helper — exponential back-off with jitter
// ---------------------------------------------------------------------------
async function fetchWithRetry(
  url: string,
  opts: RequestInit,
  retries = 3,
  backoffMs = 500,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok) return res;
      if (res.status >= 500 && attempt < retries) {
        await new Promise((r) => setTimeout(r, backoffMs * 2 ** attempt + Math.random() * 200));
        continue;
      }
      throw new Error(`Server returned ${res.status}: ${res.statusText}`);
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, backoffMs * 2 ** attempt + Math.random() * 200));
    }
  }
  throw new Error("Exhausted retries");
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
function StatusBadge({ healthy }: { healthy: boolean }) {
  return (
    <span
      className={`inline-block w-3 h-3 rounded-full mr-2 ${healthy ? "bg-green-500" : "bg-red-500"}`}
      title={healthy ? "Server healthy" : "Server unreachable"}
    />
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
type Tab = "playground" | "history" | "presets";

const TABS: { id: Tab; label: string }[] = [
  { id: "playground", label: "Playground" },
  { id: "history", label: "History" },
  { id: "presets", label: "Presets" },
];

// ---------------------------------------------------------------------------
// Built-in prompt presets for creative coding
// ---------------------------------------------------------------------------
const PRESETS = [
  { name: "Code Review", prompt: "Review the following code for bugs, performance, and style:\n\n```\n// paste code here\n```" },
  { name: "Refactor", prompt: "Refactor this code to be cleaner, more idiomatic, and better documented:\n\n```\n// paste code here\n```" },
  { name: "Explain", prompt: "Explain this code step by step, as if teaching a junior developer:\n\n```\n// paste code here\n```" },
  { name: "Generate Tests", prompt: "Generate comprehensive unit tests for the following function:\n\n```\n// paste code here\n```" },
  { name: "Design System", prompt: "Design a system architecture for the following requirements:\n\n" },
  { name: "Creative Brief", prompt: "You are a creative technologist. Brainstorm 5 innovative solutions for:\n\n" },
];

// ---------------------------------------------------------------------------
// History entry
// ---------------------------------------------------------------------------
interface HistoryEntry {
  id: number;
  model: string;
  prompt: string;
  output: string;
  ts: number;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function CreativePlayground() {
  const { models } = useModels();
  const { isHealthy } = useHealth();
  const [selectedModel, setSelectedModel] = useState(models?.[0]?.model || "");
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("playground");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [temperature, setTemperature] = useState(0.7);
  const abortRef = useRef<AbortController | null>(null);
  const idCounter = useRef(0);

  // Sync model list when it loads
  useEffect(() => {
    if (models?.length && !selectedModel) setSelectedModel(models[0].model);
  }, [models, selectedModel]);

  // ------- Run prompt -------
  const handleRun = useCallback(async () => {
    if (!selectedModel || !prompt.trim()) return;
    setLoading(true);
    setError(null);
    setOutput("");

    abortRef.current = new AbortController();

    try {
      const res = await fetchWithRetry(
        "/api/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: selectedModel,
            prompt: prompt.trim(),
            stream: false,
            options: { temperature },
          }),
          signal: abortRef.current.signal,
        },
        3,
        600,
      );
      const data = await res.json();
      const text = data?.response ?? data?.message?.content ?? "No output";
      setOutput(text);
      setHistory((h: HistoryEntry[]) => [
        { id: ++idCounter.current, model: selectedModel, prompt, output: text, ts: Date.now() },
        ...h.slice(0, 49), // keep last 50
      ]);
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") {
        setError("Request cancelled.");
      } else {
        setError((err as Error).message || "Unknown error");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [selectedModel, prompt, temperature]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ------- Render -------
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
        <StatusBadge healthy={isHealthy} />
        <h1 className="text-xl font-bold text-purple-700 dark:text-purple-300">Creative Studio</h1>
        <span className="text-xs text-neutral-400 ml-auto">xdragon fortress</span>
      </header>

      {/* Tabs */}
      <nav className="flex gap-1 px-6 pt-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`px-3 py-1 rounded-t text-sm font-medium transition-colors ${
              activeTab === t.id
                ? "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* ===== PLAYGROUND TAB ===== */}
        {activeTab === "playground" && (
          <div className="max-w-3xl mx-auto space-y-4">
            {/* Model + Temperature */}
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block mb-1 text-sm font-semibold">Model</label>
                <select
                  title="Select a model"
                  className="border rounded px-2 py-1.5 w-full dark:bg-neutral-800 dark:border-neutral-600"
                  value={selectedModel}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedModel(e.target.value)}
                >
                  {models?.map((m: { model: string }) => (
                    <option key={m.model} value={m.model}>{m.model}</option>
                  ))}
                </select>
              </div>
              <div className="w-32">
                <label className="block mb-1 text-sm font-semibold">Temp: {temperature.toFixed(1)}</label>
                <input
                  title="Temperature"
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setTemperature(parseFloat(e.target.value))}
                  className="w-full mt-2"
                />
              </div>
            </div>

            {/* Prompt */}
            <div>
              <label className="block mb-1 text-sm font-semibold">Prompt</label>
              <textarea
                className="border rounded px-3 py-2 w-full min-h-[120px] font-mono text-sm dark:bg-neutral-800 dark:border-neutral-600"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Type your creative prompt here..."
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                className="bg-purple-600 text-white px-5 py-2 rounded hover:bg-purple-700 disabled:opacity-50 font-semibold"
                onClick={handleRun}
                disabled={loading || !isHealthy || !selectedModel || !prompt.trim()}
              >
                {loading ? "Running..." : "Run"}
              </button>
              {loading && (
                <button
                  className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 text-sm"
                  onClick={handleCancel}
                >
                  Cancel
                </button>
              )}
              <button
                className="ml-auto text-sm text-neutral-400 hover:text-neutral-600"
                onClick={() => { setPrompt(""); setOutput(""); setError(null); }}
              >
                Clear
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="border border-red-300 bg-red-50 dark:bg-red-900/20 rounded px-3 py-2 text-sm text-red-700 dark:text-red-300">
                {error}
                <button className="ml-2 underline" onClick={handleRun}>Retry</button>
              </div>
            )}

            {/* Output */}
            <div>
              <label className="block mb-1 text-sm font-semibold">Output</label>
              <div className="border rounded px-3 py-3 min-h-[120px] bg-neutral-50 dark:bg-neutral-800 dark:border-neutral-600 whitespace-pre-wrap font-mono text-sm">
                {loading ? <span className="animate-pulse text-neutral-400">Generating...</span> : output || <span className="text-neutral-300">Output appears here</span>}
              </div>
            </div>
          </div>
        )}

        {/* ===== HISTORY TAB ===== */}
        {activeTab === "history" && (
          <div className="max-w-3xl mx-auto">
            {history.length === 0 ? (
              <p className="text-neutral-400 text-sm">No history yet. Run a prompt to get started.</p>
            ) : (
              <div className="space-y-3">
                {history.map((h: HistoryEntry) => (
                  <div key={h.id} className="border rounded p-3 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <div className="flex items-center gap-2 text-xs text-neutral-400 mb-1">
                      <span className="font-semibold text-purple-600">{h.model}</span>
                      <span>{new Date(h.ts).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-sm font-mono truncate">{h.prompt}</p>
                    <button
                      className="text-xs text-purple-500 hover:underline mt-1"
                      onClick={() => { setPrompt(h.prompt); setSelectedModel(h.model); setActiveTab("playground"); }}
                    >
                      Re-use this prompt
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== PRESETS TAB ===== */}
        {activeTab === "presets" && (
          <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                className="border rounded p-4 text-left hover:bg-purple-50 dark:hover:bg-purple-900/20 dark:border-neutral-700 transition-colors"
                onClick={() => { setPrompt(p.prompt); setActiveTab("playground"); }}
              >
                <span className="font-semibold text-sm text-purple-700 dark:text-purple-300">{p.name}</span>
                <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{p.prompt}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
