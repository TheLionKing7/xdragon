/**
 * useHealth — polls Ollama directly at localhost:11434
 * 
 * PLACE AT: xdragon/app/ui/app/src/hooks/useHealth.ts
 * (replaces the original xDragon useHealth that used the Vite proxy)
 *
 * Polls every 8 seconds. Returns { isHealthy } immediately.
 * Does NOT go through Vite proxy — direct fetch to Ollama port.
 */
import { useState, useEffect, useRef } from "react";

const OLLAMA_URL  = "http://localhost:11434";
const POLL_MS     = 8_000;
const TIMEOUT_MS  = 2_000;

export function useHealth(): { isHealthy: boolean } {
  const [isHealthy, setIsHealthy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = async () => {
    try {
      const r = await fetch(`${OLLAMA_URL}/api/version`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      setIsHealthy(r.ok);
    } catch {
      setIsHealthy(false);
    }
  };

  useEffect(() => {
    check();                                        // immediate check on mount
    timer.current = setInterval(check, POLL_MS);   // then every 8s
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  return { isHealthy };
}
