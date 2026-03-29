/**
 * PLACE AT: xdragon/app/ui/app/src/util/jsonl-parsing.ts
 *
 * Parses a streaming JSONL (newline-delimited JSON) fetch response
 * into an async generator of typed objects.
 */
export async function* parseJsonlFromResponse<T>(
  response: Response
): AsyncGenerator<T> {
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let   buffer  = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        yield JSON.parse(trimmed) as T;
      } catch {
        // skip malformed lines
      }
    }
  }

  // flush any remaining buffer
  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer.trim()) as T;
    } catch { /* ignore */ }
  }
}
