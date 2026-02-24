import React, { useState } from "react";
import { useModels } from "@/hooks/useModels";
import { useSendMessage } from "@/hooks/useChats";

export default function CreativePlayground() {
  const { models } = useModels();
  const [selectedModel, setSelectedModel] = useState(models[0]?.model || "");
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const sendMessage = useSendMessage();

  const handleRun = async () => {
    if (!selectedModel || !prompt) return;
    const result = await sendMessage({
      model: selectedModel,
      prompt,
      stream: false,
    });
    setOutput(result?.message?.content || "No output");
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Creative Coding Playground</h1>
      <div className="mb-4">
        <label className="block mb-1 font-semibold">Model</label>
        <select
          className="border rounded px-2 py-1 w-full"
          value={selectedModel}
          onChange={e => setSelectedModel(e.target.value)}
        >
          {models.map(m => (
            <option key={m.model} value={m.model}>
              {m.model}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-4">
        <label className="block mb-1 font-semibold">Prompt</label>
        <textarea
          className="border rounded px-2 py-1 w-full min-h-[100px]"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
        />
      </div>
      <button
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        onClick={handleRun}
      >
        Run
      </button>
      <div className="mt-6">
        <label className="block mb-1 font-semibold">Output</label>
        <div className="border rounded px-2 py-2 min-h-[80px] bg-gray-50 whitespace-pre-wrap">
          {output}
        </div>
      </div>
    </div>
  );
}
