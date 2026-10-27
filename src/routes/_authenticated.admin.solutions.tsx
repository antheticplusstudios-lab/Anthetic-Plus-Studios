import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AdminPage, AreaField, Loading, Panel, TextField } from "@/components/admin-ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { automations, isAutomationSlug } from "@/lib/automations";
import { getAdminSolutions, saveSolutions } from "@/lib/solutions.functions";
import { useLivePricing, storefrontItems } from "@/lib/pricing";
import {
  SOLUTION_ICONS,
  solutionsListSchema,
  type SiteSolution,
  type SolutionIconKey,
} from "@/lib/solutions";

export const Route = createFileRoute("/_authenticated/admin/solutions")({
  head: () => ({
    meta: [
      {
        name: "description",
        content: "Edit the Solutions cards shown on the AntheticPlus Products page.",
      },
      { property: "og:title", content: "Solutions — AntheticPlus Studios" },
      {
        property: "og:description",
        content: "Edit the Solutions cards shown on the AntheticPlus Products page.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Solutions — AntheticPlus Control Center" },
    ],
  }),
  component: SolutionsAdminPage,
});

const selectCls =
  "h-9 w-full rounded-md border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function blankSolution(): SiteSolution {
  return {
    id: `solution-${Date.now().toString(36)}`,
    icon: "sparkles",
    slug: "voice-sms-receptionist",
    en: { team: "", problem: "" },
    bn: { team: "", problem: "" },
  };
}

function SolutionsAdminPage() {
  const qc = useQueryClient();
  const { data: plans } = useLivePricing();
  const products = storefrontItems(plans);
  const save = useServerFn(saveSolutions);
  const load = useServerFn(getAdminSolutions);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["site-solutions-admin"],
    queryFn: () => load(),
    refetchOnWindowFocus: false,
  });
  const [list, setList] = useState<SiteSolution[]>([]);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const editing = useRef(false);
  useEffect(() => {
    if (data && !editing.current) setList(data);
  }, [data]);

  const m = useMutation({
    mutationFn: (solutions: SiteSolution[]) => save({ data: { solutions } }),
    onSuccess: (result) => {
      if (!result.ok) throw new Error("The server did not confirm the change.");
      toast.success("Solutions saved");
      editing.current = false;
      qc.setQueryData(["site-solutions"], list);
      qc.setQueryData(["site-solutions-admin"], list);
      void qc.invalidateQueries({ queryKey: ["site-solutions"] });
      void qc.invalidateQueries({ queryKey: ["site-solutions-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Loading />;
  if (error || !data)
    return (
      <AdminPage title="Solutions" subtitle="The saved solutions could not be loaded.">
        <p role="alert" className="text-sm text-destructive">
          No defaults will overwrite your saved configuration.
        </p>
        <Button variant="outline" onClick={() => void refetch()}>
          Retry
        </Button>
      </AdminPage>
    );

  const dirty = JSON.stringify(list) !== JSON.stringify(data);
  const valid =
    solutionsListSchema.safeParse(list).success &&
    list.every((item) => products.some((product) => product.slug === item.slug));
  const patch = (id: string, next: Partial<SiteSolution>) => {
    editing.current = true;
    setList((cur) => cur.map((s) => (s.id === id ? { ...s, ...next } : s)));
  };
  const patchCopy = (id: string, lang: "en" | "bn", field: "team" | "problem", v: string) => {
    editing.current = true;
    setList((cur) =>
      cur.map((s) => (s.id === id ? { ...s, [lang]: { ...s[lang], [field]: v } } : s)),
    );
  };

  return (
    <AdminPage
      title="Solutions"
      subtitle="The cards shown under Products. Each card links to a real product; add, edit or remove cards and save."
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            disabled={list.length >= 24 || m.isPending}
            onClick={() => {
              editing.current = true;
              setList((cur) => [...cur, blankSolution()]);
            }}
          >
            <Plus /> Add solution
          </Button>
          <Button
            size="sm"
            disabled={!dirty || !valid || m.isPending}
            onClick={() => m.mutate(list)}
          >
            {m.isPending ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        {list.map((s) => {
          const Icon = SOLUTION_ICONS[s.icon];
          return (
            <Panel
              key={s.id}
              title={s.en.team || "New solution"}
              description={`Links to ${automations.find((a) => a.slug === s.slug)?.name ?? s.slug}`}
              actions={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${s.en.team || "solution"}`}
                  onClick={() => setPendingDelete(s.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor={`${s.id}-product`}>Product it links to</Label>
                  <select
                    id={`${s.id}-product`}
                    className={selectCls}
                    value={s.slug}
                    onChange={(e) => {
                      const slug = e.target.value;
                      if (isAutomationSlug(slug)) patch(s.id, { slug });
                    }}
                  >
                    {!products.some((product) => product.slug === s.slug) && (
                      <option value={s.slug} disabled>
                        Unavailable — choose a product
                      </option>
                    )}
                    {products.map((a) => (
                      <option key={a.slug} value={a.slug}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label>Icon</Label>
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <select
                      className={selectCls}
                      value={s.icon}
                      onChange={(e) => patch(s.id, { icon: e.target.value as SolutionIconKey })}
                    >
                      {Object.keys(SOLUTION_ICONS).map((key) => (
                        <option key={key} value={key}>
                          {key}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Audience (English)</Label>
                  <TextField
                    value={s.en.team}
                    onChange={(e) => patchCopy(s.id, "en", "team", e.target.value)}
                    placeholder="Dental & medical practices"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Audience (Bangla)</Label>
                  <TextField
                    value={s.bn.team}
                    onChange={(e) => patchCopy(s.id, "bn", "team", e.target.value)}
                    placeholder="ডেন্টাল ও মেডিকেল প্র্যাকটিস"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>What the product does for them (English)</Label>
                  <AreaField
                    rows={2}
                    value={s.en.problem}
                    onChange={(e) => patchCopy(s.id, "en", "problem", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>What the product does for them (Bangla)</Label>
                  <AreaField
                    rows={2}
                    value={s.bn.problem}
                    onChange={(e) => patchCopy(s.id, "bn", "problem", e.target.value)}
                  />
                </div>
              </div>
            </Panel>
          );
        })}
        {!list.length && (
          <p className="text-sm text-muted-foreground">
            No solutions yet. Add one to show it on the Products page.
          </p>
        )}
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this solution?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from the Products page when you save. This does not delete the product
              it links to.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                editing.current = true;
                setList((cur) => cur.filter((s) => s.id !== pendingDelete));
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminPage>
  );
}
