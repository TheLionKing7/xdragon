import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { getSettings } from "@/api";
import { useQuery } from "@tanstack/react-query";
import { useCloudStatus } from "@/hooks/useCloudStatus";
import { useEffect, useRef } from "react";
import { ArchonTunnel } from "@/lib/archon-tunnel";

/**
 * ArchonTunnelProvider — initialises the xDragon ↔ Archon tunnel ONCE
 * at app root level. Never unmounts, so the connection is truly persistent
 * across all route changes including Settings navigation.
 */
function ArchonTunnelProvider() {
  const initialised = useRef(false);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    const tunnel = ArchonTunnel.getInstance();

    // Already connected from a previous render (HMR / StrictMode double-invoke)
    if (tunnel.status === 'connected' || tunnel.status === 'connecting') return;

    // Connect if gateway key is configured
    if (tunnel.getGatewayKey()) {
      tunnel.connect();
    }

    // Re-connect automatically if key is added later (e.g. user sets it in Settings)
    // Poll localStorage every 3s until connected — stops once connected
    const keyPoller = setInterval(() => {
      const t = ArchonTunnel.getInstance();
      if (t.status === 'connected' || t.status === 'connecting') {
        clearInterval(keyPoller);
        return;
      }
      if (t.getGatewayKey()) {
        t.connect();
      }
    }, 3000);

    // No cleanup — this provider lives for the entire app lifetime
    // The interval clears itself once connected
  }, []);

  return null; // renders nothing
}

function RootComponent() {
  // Fetch settings on app startup
  useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  // Fetch cloud status on startup (best-effort)
  useCloudStatus();

  return (
    <div>
      <ArchonTunnelProvider />
      <Outlet />
    </div>
  );
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootComponent,
});