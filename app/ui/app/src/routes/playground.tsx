import { createFileRoute } from "@tanstack/react-router";
import CreativePlayground from "@/components/CreativePlayground";

export const Route = createFileRoute("/playground")({
  component: CreativePlayground,
});
