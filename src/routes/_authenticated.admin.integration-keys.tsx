import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Plus, Trash2, Activity, DatabaseZap, ShieldCheck } from "lucide-react";
import { AdminPage, Panel, Loading, EmptyState, shortDate, timeAgo } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  adminAddIntegrationKey,
  adminDeleteIntegrationKey,
  adminListIntegrationKeys,
  adminTestIntegrationKey,
  adminToggleIntegrationKey,
} from "@/lib/integration-keys.functions";
import { SCOPE_GROUPS, type KeyPoolView } from "@/lib/integration-keys";

export const Route = createFileRoute("/_authenticated/admin/integration-keys")({
  head: () => ({
    meta: [
      { name: "twitter:card", content: "summary" },

      { title: "Integration Keys — AntheticPlus Control Center" },
      {
        name: "description",
        content: "Add and rotate Inworld, Twilio, Resend and AI keys for every automation.",
      },
      { property: "og:title", content: "Integration Keys" },
      {
        property: "og:description",
        content: "Per-automation key pools with automatic limit switching.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: IntegrationKeysPage,
});

import { PoolCard } from "@/components/key-pool-card";

function IntegrationKeysPage() {
  const listFn = useServerFn(adminListIntegrationKeys);
  const { data, isLoading, error } = useQuery({
    queryKey: ["integration-keys"],
    queryFn: () => listFn(),
  });

  if (isLoading)
    return (
      <AdminPage title="Integration Keys" subtitle="Per-automation key pools">
        <Loading label="Loading key pools…" />
      </AdminPage>
    );
  if (error || !data)
    return (
      <AdminPage title="Integration Keys" subtitle="Per-automation key pools">
        <Panel
          title="Could not load keys"
          description={(error as Error)?.message ?? "Unknown error"}
        >
          <EmptyState title="Something went wrong" description="Try refreshing the page." />
        </Panel>
      </AdminPage>
    );
  if (data.notConfigured) {
    return (
      <AdminPage
        title="Integration Keys"
        subtitle="Per-automation key pools with automatic limit switching."
      >
        <Panel title="Connect your databases first" description={data.message}>
          <EmptyState
            title="Databases not connected yet"
            description="Add the 4 database keys in platform settings, then this page fills with every automation's key pools."
            action={
              <Button variant="outline" onClick={() => window.location.reload()}>
                <DatabaseZap className="mr-1 h-4 w-4" /> Re-check
              </Button>
            }
          />
        </Panel>
      </AdminPage>
    );
  }

  const byScope = data.byScope;

  return (
    <AdminPage
      title="Integration Keys"
      subtitle="Every automation has its own key pools. Keys rotate automatically when one hits its limit — conversations never drop."
    >
      <Panel title="How rotation works" description="Keys are tried in order, least-used first.">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4" /> Keys are stored encrypted and are never displayed
          again after saving. A key that hits a limit rests while the next key takes over instantly;
          resting keys rejoin automatically.
        </div>
      </Panel>

      <Tabs defaultValue={SCOPE_GROUPS[0]!.scope} className="mt-4">
        <TabsList className="flex flex-wrap">
          {SCOPE_GROUPS.map((g) => (
            <TabsTrigger key={g.scope} value={g.scope}>
              {g.title}
            </TabsTrigger>
          ))}
        </TabsList>
        {SCOPE_GROUPS.map((g) => (
          <TabsContent key={g.scope} value={g.scope} className="space-y-4">
            <p className="text-muted-foreground text-sm">{g.tagline}</p>
            {g.pools.map((pool) => (
              <PoolCard
                key={pool.provider}
                scope={g.scope}
                pool={pool}
                keys={(byScope[g.scope] ?? []).filter((k) => k.provider === pool.provider)}
              />
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </AdminPage>
  );
}
