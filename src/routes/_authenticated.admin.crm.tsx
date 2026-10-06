import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminPage, Loading, Panel, money } from "@/components/admin-ui";
import { useAllProfiles, useTags } from "@/hooks/use-admin";
import { isLive } from "@/lib/portal";
import { adminAddCrmTag, adminRemoveCrmTag, adminListCrm } from "@/lib/admin-data.functions";

export const Route = createFileRoute("/_authenticated/admin/crm")({ component: CrmPage });

const QUICK_TAGS = ["VIP", "Late-Payer", "Onboarding", "Renewal risk", "Enterprise"];

type Profile = {
  id: string;
  user_id?: string | null;
  client_id?: string | null;
  company_name: string | null;
  company_email: string | null;
  website_url: string | null;
  category: string | null;
};

type Instance = { user_id: string; status: string; expires_at: string | null; killed: boolean };
type Payment = { user_id: string; status: string; amount: number };
type Tag = { id: string; client_id: string; tag: string };

function ClientCard({
  profile,
  revenue,
  automationsCount,
  liveCount,
  tags,
}: {
  profile: Profile;
  revenue: number;
  automationsCount: number;
  liveCount: number;
  tags: Tag[];
}) {
  const queryClient = useQueryClient();
  const [tagInput, setTagInput] = useState("");

  const addTag = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const exists = tags.some((t) => t.tag.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      toast.error("That tag already exists for this client.");
      return;
    }
    try {
      await adminAddCrmTag({
        data: { clientId: profile.client_id ?? profile.id, tag: trimmed },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add tag");
      return;
    }
    toast.success("Tag added");
    setTagInput("");
    void queryClient.invalidateQueries({ queryKey: ["admin", "tags"] });
  };

  const removeTag = async (id: string) => {
    try {
      await adminRemoveCrmTag({ data: { id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove tag");
      return;
    }
    toast.success("Tag removed");
    void queryClient.invalidateQueries({ queryKey: ["admin", "tags"] });
  };

  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div>
        <p className="text-base font-extrabold">{profile.company_name || profile.company_email}</p>
        {profile.website_url && (
          <p className="text-xs text-muted-foreground">{profile.website_url}</p>
        )}
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {profile.category || "Uncategorized"}
        </p>
        <p className="text-xs text-muted-foreground">{profile.company_email}</p>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xl font-extrabold tabular-nums">{money(revenue)}</p>
        <p className="text-xs text-muted-foreground">
          {automationsCount} automations · {liveCount} live
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-secondary-foreground"
          >
            {t.tag}
            <button onClick={() => void removeTag(t.id)} aria-label={`Remove ${t.tag}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-xs text-muted-foreground">No tags yet.</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_TAGS.map((qt) => (
          <button
            key={qt}
            onClick={() => setTagInput(qt)}
            className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:bg-accent"
          >
            {qt}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Add tag…"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void addTag(tagInput);
          }}
        />
        <Button onClick={() => void addTag(tagInput)}>Add</Button>
      </div>
    </div>
  );
}

function CrmPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "crm"],
    queryFn: () => adminListCrm(),
  });
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter(
      ({ profile }) =>
        !q ||
        `${profile.company_name ?? ""} ${profile.website_url ?? ""} ${profile.company_email ?? ""}`
          .toLowerCase()
          .includes(q),
    );
  }, [data, search]);
  if (isLoading) return <Loading />;
  return (
    <AdminPage
      title="Client CRM & Tags"
      subtitle="One record per client with lifetime revenue, automation count and operational tags."
    >
      <Panel title="Search">
        <Input
          placeholder="Search company name, website or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Panel>
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No clients match this search.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((row) => (
            <ClientCard
              key={row.profile.id}
              profile={row.profile}
              revenue={row.revenue}
              automationsCount={row.automationsCount}
              liveCount={row.liveCount}
              tags={row.tags}
            />
          ))}
        </div>
      )}
    </AdminPage>
  );
}
