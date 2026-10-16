import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { AdminPage, Panel, Loading, EmptyState, timeAgo } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  adminListCampaigns,
  adminListContactMessages,
  adminListUsers,
  adminSendCampaign,
} from "@/lib/user-admin.functions";
import { markdownToEmailHtml } from "@/lib/markdown-email";
import { PLATFORM_LABEL } from "@/lib/platforms";

export const Route = createFileRoute("/_authenticated/admin/messages")({
  head: () => ({
    meta: [
      { title: "Inbox & Email — AntheticPlus Control Center" },
      {
        name: "description",
        content: "Read contact form messages and email users on either website.",
      },
      { property: "og:title", content: "Inbox & Email" },
      { property: "og:description", content: "Contact inbox and Markdown email sender." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MessagesPage,
});

function Inbox() {
  const fn = useServerFn(adminListContactMessages);
  const { data, isLoading } = useQuery({ queryKey: ["contact-inbox"], queryFn: () => fn() });
  if (isLoading) return <Loading label="Loading messages…" />;
  if (data?.error) return <EmptyState title="Inbox not ready" description={data.error} />;
  if (!data?.messages.length)
    return <EmptyState title="No messages yet" description="Contact form messages show up here." />;
  return (
    <ul className="divide-y">
      {data.messages.map((m) => (
        <li key={m.id} className="space-y-1 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{m.name}</span>
            <a className="text-primary text-sm" href={`mailto:${m.email}`}>
              {m.email}
            </a>
            <span className="bg-muted rounded-full px-2 py-0.5 text-[11px]">{m.topic}</span>
            <span className="text-muted-foreground ml-auto text-xs">{timeAgo(m.created_at)}</span>
          </div>
          {m.company && <div className="text-muted-foreground text-xs">{m.company}</div>}
          <p className="text-sm whitespace-pre-wrap">{m.message}</p>
        </li>
      ))}
    </ul>
  );
}

function Composer() {
  const usersFn = useServerFn(adminListUsers);
  const sendFn = useServerFn(adminSendCampaign);
  const campaignsFn = useServerFn(adminListCampaigns);
  const { data } = useQuery({ queryKey: ["admin-users"], queryFn: () => usersFn() });
  const { data: past, refetch } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => campaignsFn(),
  });
  const [platform, setPlatform] = useState<"antheticplus" | "autumic" | "both">("both");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [md, setMd] = useState(
    "# Hello!\n\nWrite your message here. Add images with ![alt](https://...)",
  );
  const [sending, setSending] = useState(false);

  const pool = useMemo(
    () =>
      (data?.users ?? []).filter(
        (u) => u.email && !u.bannedAt && (platform === "both" || u.platform === platform),
      ),
    [data, platform],
  );
  const preview = useMemo(() => markdownToEmailHtml(md), [md]);
  const toggle = (e: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(e)) n.delete(e);
      else n.add(e);
      return n;
    });
  const chosen = pool.filter((u) => picked.has(u.email)).map((u) => u.email);

  async function send() {
    setSending(true);
    try {
      const r = await sendFn({ data: { platform, subject, markdown: md, recipients: chosen } });
      if (r.sent === r.total) toast.success(`Sent to ${r.sent} users`);
      else toast.error(`Sent ${r.sent}/${r.total}. ${r.error}`);
      void refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(["antheticplus", "autumic", "both"] as const).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={platform === p ? "default" : "outline"}
              onClick={() => {
                setPlatform(p);
                setPicked(new Set());
              }}
            >
              {p === "both" ? "Both sites" : PLATFORM_LABEL[p]}
            </Button>
          ))}
        </div>
        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
            <span>
              {chosen.length} of {pool.length} selected
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setPicked(
                  chosen.length === pool.length ? new Set() : new Set(pool.map((u) => u.email)),
                )
              }
            >
              {chosen.length === pool.length && pool.length ? "Clear" : "Select all"}
            </Button>
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {pool.map((u) => (
              <li key={u.userId}>
                <label className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                  <Checkbox checked={picked.has(u.email)} onCheckedChange={() => toggle(u.email)} />
                  <span className="flex-1 truncate">{u.name || u.email}</span>
                  <span className="text-muted-foreground truncate text-xs">{u.email}</span>
                </label>
              </li>
            ))}
            {!pool.length && (
              <li className="text-muted-foreground px-3 py-4 text-sm">
                No users on this site yet.
              </li>
            )}
          </ul>
        </div>
        <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea
          rows={12}
          className="font-mono text-sm"
          value={md}
          onChange={(e) => setMd(e.target.value)}
        />
        <Button disabled={sending || !subject.trim() || !chosen.length} onClick={send}>
          <Send className="mr-1 h-4 w-4" /> {sending ? "Sending…" : `Send to ${chosen.length}`}
        </Button>
      </div>
      <div className="space-y-3">
        <div className="text-muted-foreground text-xs font-semibold uppercase">Preview</div>
        <div
          className="bg-card prose prose-sm max-w-none rounded-md border p-4 [&_img]:max-w-full"
          dangerouslySetInnerHTML={{ __html: preview }}
        />
        <div className="text-muted-foreground pt-2 text-xs font-semibold uppercase">
          Sent before
        </div>
        <ul className="divide-y text-sm">
          {(past?.campaigns ?? []).map((c) => (
            <li key={c.id} className="flex justify-between py-2">
              <span className="truncate">{c.subject}</span>
              <span className="text-muted-foreground text-xs">
                {c.sent}/{c.recipients} · {timeAgo(c.created_at)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MessagesPage() {
  return (
    <AdminPage
      title="Inbox & Email"
      subtitle="Contact form messages, and emails to users on your site or Autumic."
    >
      <Tabs defaultValue="inbox">
        <TabsList>
          <TabsTrigger value="inbox">Contact inbox</TabsTrigger>
          <TabsTrigger value="send">Send email</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox">
          <Panel title="Contact inbox">
            <Inbox />
          </Panel>
        </TabsContent>
        <TabsContent value="send">
          <Panel
            title="Send email"
            description="Write in Markdown. Images and links are supported."
          >
            <Composer />
          </Panel>
        </TabsContent>
      </Tabs>
    </AdminPage>
  );
}
