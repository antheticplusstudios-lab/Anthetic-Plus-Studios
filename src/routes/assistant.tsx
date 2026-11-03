import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { AssistantConsole } from "@/components/assistant/assistant-console";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "AI Assistant — Autumic" },
      {
        name: "description",
        content:
          "Chat or talk with the Autumic assistant about automations, pricing and your account.",
      },
      { property: "og:title", content: "AI Assistant — Autumic" },
      {
        property: "og:description",
        content:
          "Chat or talk with the Autumic assistant about automations, pricing and your account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssistantPage,
});

function AssistantPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Autumic Assistant</h1>
        <AssistantConsole variant="full" />
      </main>
    </div>
  );
}
