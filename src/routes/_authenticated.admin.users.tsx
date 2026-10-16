import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, MicOff, Search, ShieldCheck, Volume2 } from "lucide-react";
import { AdminPage, Panel, Loading, EmptyState, shortDate, timeAgo } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { adminListUsers, adminModerateUser, type AdminUserRow } from "@/lib/user-admin.functions";
import { PLATFORM_LABEL, hostOf, platformOfDomain, type Platform } from "@/lib/platforms";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "Users — AntheticPlus Control Center" },
      {
        name: "description",
        content: "Search, ban, mute and inspect every user across both websites.",
      },
      { property: "og:title", content: "User management" },
      { property: "og:description", content: "Users, their automations, domains and platforms." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsersPage,
});

export function PlatformBadge({ platform, prefix }: { platform: Platform; prefix?: string }) {
  const cls =
    platform === "autumic"
      ? "bg-accent text-accent-foreground"
      : platform === "antheticplus"
        ? "bg-primary/12 text-primary"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      {prefix ? `${prefix}: ` : ""}
      {PLATFORM_LABEL[platform]}
    </span>
  );
}

function status(u: AdminUserRow) {
  if (u.bannedAt) return { text: "Banned", cls: "bg-destructive/12 text-destructive" };
  if (u.mutedUntil && new Date(u.mutedUntil).getTime() > Date.now())
    return { text: "Muted", cls: "bg-muted text-foreground" };
  return { text: "Active", cls: "bg-success/12 text-success" };
}

function UsersPage() {
  const listFn = useServerFn(adminListUsers);
  const modFn = useServerFn(adminModerateUser);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-users"], queryFn: () => listFn() });
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState<"all" | Platform>("all");
  const [open, setOpen] = useState<AdminUserRow | null>(null);

  const users = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.users ?? []).filter(
      (u) =>
        (platform === "all" || u.platform === platform) &&
        (!term ||
          [u.name, u.email, u.company, u.website, u.signupDomain].some((v) =>
            v.toLowerCase().includes(term),
          )),
    );
  }, [data, q, platform]);

  async function moderate(u: AdminUserRow, action: "ban" | "unban" | "mute" | "unmute") {
    try {
      await modFn({ data: { userId: u.userId, action, muteHours: 24 } });
      toast.success(`${u.name || u.email}: ${action} done`);
      setOpen(null);
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <AdminPage
      title="Users"
      subtitle="Everyone who signed up on your site or Autumic, with their automations."
    >
      {isLoading ? (
        <Loading label="Loading users…" />
      ) : data?.error ? (
        <Panel title="Could not load users" description={data.error}>
          <EmptyState
            title="Something went wrong"
            description="Make sure the database setup files were run."
          />
        </Panel>
      ) : (
        <Panel
          title={`${users.length} users`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
                <Input
                  className="w-56 pl-8"
                  placeholder="Search name, email, domain"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              {(["all", "antheticplus", "autumic"] as const).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={platform === p ? "default" : "outline"}
                  onClick={() => setPlatform(p)}
                >
                  {p === "all" ? "All" : PLATFORM_LABEL[p]}
                </Button>
              ))}
            </div>
          }
        >
          {users.length === 0 ? (
            <EmptyState title="No users match" description="Try a different search." />
          ) : (
            <ul className="divide-y">
              {users.map((u) => {
                const s = status(u);
                return (
                  <li key={u.userId}>
                    <button
                      className="hover:bg-muted/50 flex w-full flex-wrap items-center gap-3 rounded-md px-2 py-3 text-left"
                      onClick={() => setOpen(u)}
                    >
                      <div className="min-w-48 flex-1">
                        <div className="font-medium">{u.name || "Unnamed"}</div>
                        <div className="text-muted-foreground text-xs">{u.email}</div>
                      </div>
                      <PlatformBadge platform={u.platform} prefix="Signed up" />
                      <span className="text-muted-foreground text-xs">
                        {u.automations.length} automations
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>
                        {s.text}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open && (
            <div className="space-y-5">
              <div>
                <SheetTitle>{open.name || open.email}</SheetTitle>
                <SheetDescription>{open.email}</SheetDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <PlatformBadge platform={open.platform} prefix="Signed up" />
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status(open).cls}`}
                >
                  {status(open).text}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs">Company</dt>
                  <dd>{open.company || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Website</dt>
                  <dd className="break-all">{hostOf(open.website) || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Sign-up domain</dt>
                  <dd>{hostOf(open.signupDomain) || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Sign-in methods</dt>
                  <dd>{open.providers.join(", ") || "email"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Joined</dt>
                  <dd>{shortDate(open.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Last seen</dt>
                  <dd>{open.lastSignIn ? timeAgo(open.lastSignIn) : "—"}</dd>
                </div>
              </dl>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Automations</h3>
                {open.automations.length === 0 ? (
                  <p className="text-muted-foreground text-sm">None yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {open.automations.map((a) => (
                      <li key={a.id} className="rounded-md border p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{a.type.replace(/_/g, " ")}</span>
                          <span className="text-muted-foreground text-xs">
                            {a.active ? a.state : "off"}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <PlatformBadge
                            platform={platformOfDomain(a.orderedOn)}
                            prefix="Ordered on"
                          />
                          {a.runningOn && (
                            <span className="bg-muted rounded-full px-2 py-0.5 text-[11px]">
                              Runs on {hostOf(a.runningOn)}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {open.bannedAt ? (
                  <Button variant="outline" onClick={() => moderate(open, "unban")}>
                    <ShieldCheck className="mr-1 h-4 w-4" />
                    Unban
                  </Button>
                ) : (
                  <Button variant="destructive" onClick={() => moderate(open, "ban")}>
                    <Ban className="mr-1 h-4 w-4" />
                    Ban
                  </Button>
                )}
                {open.mutedUntil && new Date(open.mutedUntil).getTime() > Date.now() ? (
                  <Button variant="outline" onClick={() => moderate(open, "unmute")}>
                    <Volume2 className="mr-1 h-4 w-4" />
                    Unmute
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => moderate(open, "mute")}>
                    <MicOff className="mr-1 h-4 w-4" />
                    Mute 24h
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AdminPage>
  );
}
