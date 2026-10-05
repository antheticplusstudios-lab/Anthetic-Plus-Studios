import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CircleCheckBig, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateMyProfile } from "@/lib/client-platform.functions";
import { useCurrentUser, useProfile } from "@/hooks/use-portal";

export const Route = createFileRoute("/_authenticated/dashboard/profile")({
  head: () => ({
    meta: [
      { title: "Profile Settings — AntheticPlus Studios" },
      { name: "description", content: "Update your AntheticPlus company profile and target domain." },
      { property: "og:title", content: "AntheticPlus Profile Settings" },
      { property: "og:description", content: "Manage company details used by your automations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const fields = [
  ["company_name", "Company name", "Northstar Dental"],
  ["website_url", "Target domain URL", "https://yourcompany.com"],
  ["company_email", "Contact email", "you@yourcompany.com"],
  ["category", "Business category", "Healthcare"],
] as const;

function Page() {
  const { data: user } = useCurrentUser();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ company_name: "", company_email: "", website_url: "", category: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        company_name: profile.company_name,
        company_email: profile.company_email,
        website_url: profile.website_url,
        category: profile.category,
      });
    } else if (user?.email) {
      setForm((f) => ({ ...f, company_email: user.email! }));
    }
  }, [profile, user]);

  const complete = fields.every(([key]) => form[key].trim().length > 1);

  const save = async () => {
    if (!user) return;
    setBusy(true);
    setMessage("");
    try {
      await updateMyProfile({ data: { full_name: profile?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Customer", ...form } });
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Could not save profile.");
      return;
    }
    setBusy(false);
    setMessage("Profile saved successfully.");
    await queryClient.invalidateQueries({ queryKey: ["profile"] });
  };

  return (
    <div className="page-enter">
      <h1 className="text-3xl font-extrabold">Profile Settings</h1>
      <p className="mt-2 text-muted-foreground">
        Your target domain locks every automation you buy — the widget only runs on this exact website.
      </p>
      <section className="mt-8 max-w-2xl rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="grid gap-5 sm:grid-cols-2">
          {fields.map(([key, label, placeholder]) => (
            <div key={key}>
              <Label>{label}</Label>
              <Input
                value={form[key]}
                placeholder={placeholder}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="mt-2 h-12 rounded-xl"
              />
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button onClick={save} disabled={busy || !complete}>
            <Save />
            {busy ? "Saving…" : "Save profile"}
          </Button>
          {profile?.profile_completed && (
            <span className="inline-flex items-center gap-2 text-sm font-bold text-success">
              <CircleCheckBig className="h-4 w-4" />
              Profile complete
            </span>
          )}
        </div>
        {!complete && <p className="mt-3 text-sm text-muted-foreground">All four fields are required.</p>}
        {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}
      </section>
    </div>
  );
}
