import { useEffect, useRef, useState } from "react";

import {
  ARCHON_BACKEND_URL,
  FIVECLAW_URL,
  getHyperspaceUrl,
  getIdentityShieldUrl,
  getOllamaUrl,
  getXOrbitUrl,
} from "../lib/config";

export interface EcosystemStatus {
  ollama: boolean;
  archon: boolean;
  xorbit: boolean;
  hyperspace: boolean;
  identityShield: boolean;
  fiveclaw: boolean;
  anyDown: boolean;
}

const POLL_MS = 10_000;
const TIMEOUT_MS = 3_000;

async function probe(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export function useEcosystemStatus(): EcosystemStatus {
  const [status, setStatus] = useState<EcosystemStatus>({
    ollama: false,
    archon: false,
    xorbit: false,
    hyperspace: false,
    identityShield: false,
    fiveclaw: false,
    anyDown: true,
  });

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const check = async () => {
      const [ollama, archon, xorbit, hyperspace, identityShield, fiveclaw] =
        await Promise.all([
          probe(`${getOllamaUrl()}/api/version`),
          probe(`${ARCHON_BACKEND_URL}/health`),
          probe(`${getXOrbitUrl()}/health`),
          probe(`${getHyperspaceUrl()}/health`),
          probe(`${getIdentityShieldUrl()}/health`),
          probe(`${FIVECLAW_URL}/health`),
        ]);

      setStatus({
        ollama,
        archon,
        xorbit,
        hyperspace,
        identityShield,
        fiveclaw,
        anyDown: !(ollama && archon && xorbit && hyperspace && identityShield && fiveclaw),
      });
    };

    check();
    timer.current = setInterval(check, POLL_MS);
    return () => {
      if (timer.current !== null) clearInterval(timer.current);
    };
  }, []);

  return status;
}
