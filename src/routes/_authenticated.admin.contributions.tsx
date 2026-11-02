import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Save, Trash2, Eye, EyeOff, ArrowUp, ArrowDown } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminPage, AreaField, Loading, Panel, TextField } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getAdminContributions, saveContributions } from "@/lib/contributions.functions";
import { contributionsSchema, type Contributor } from "@/lib/contributions";

export const Route = createFileRoute("/_authenticated/admin/contributions")({ component: ContributionsAdminPage });
const blank = (): Contributor => ({ id: crypto.randomUUID(), name: "", title: "", badge: "", description: "", imageUrl: "", sortOrder: 0, published: true });

function ContributionsAdminPage() {
  const qc = useQueryClient();
  const load = useServerFn(getAdminContributions);
  const save = useServerFn(saveContributions);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["autumic-contributions-admin"], queryFn: () => load(), refetchOnWindowFocus: false });
  const [items, setItems] = useState<Contributor[]>([]);
  useEffect(() => { if (data) setItems(data); }, [data]);
  const mutation = useMutation({
    mutationFn: (contributors: Contributor[]) => save({ data: { contributors } }),
    onSuccess: (r) => { if (!r.ok) throw new Error("Save was not confirmed."); toast.success("Contributions saved."); qc.setQueryData(["autumic-contributions"], items); void qc.invalidateQueries({ queryKey: ["autumic-contributions"] }); void qc.invalidateQueries({ queryKey: ["autumic-contributions-admin"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (isLoading) return <Loading/>;
  if (error || !data) return <AdminPage title="Contributions of Autumic" subtitle="Manage the public contributor directory."><p role="alert" className="text-sm text-destructive">Saved contributor data could not be loaded, so nothing has been overwritten.</p><Button variant="outline" onClick={() => void refetch()}>Retry</Button></AdminPage>;
  const dirty = JSON.stringify(items) !== JSON.stringify(data);
  const valid = contributionsSchema.safeParse(items).success && items.every(p => p.name.trim() && p.title.trim() && p.description.trim().length >= 10 && /^https:\/\/(i\.)?ibb\.co\//i.test(p.imageUrl));
  const patch = (id: string, next: Partial<Contributor>) => setItems(cur => cur.map(p => p.id === id ? {...p,...next} : p));
  const move = (index: number, delta: number) => setItems(cur => { const next=[...cur]; const target=index+delta; if(target<0 || target>=next.length) return cur; [next[index],next[target]]=[next[target],next[index]]; return next.map((p,i)=>({...p,sortOrder:i})); });
  return <AdminPage title="Contributions of Autumic" subtitle="Add and manage contributor profiles shown on the public website. Use a direct imgbb image URL (i.ibb.co or ibb.co). Changes are published only when saved." actions={<><Button size="sm" variant="outline" onClick={()=>setItems(cur=>[...cur,blank()])}><Plus/> Add contributor</Button><Button size="sm" disabled={!dirty || !valid || mutation.isPending} onClick={()=>mutation.mutate(items)}><Save/>{mutation.isPending ? "Saving…" : "Save & publish"}</Button></>}>
    <div className="mb-5 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">Profiles support a name, role/title, optional custom badge, description and imgbb-hosted profile image. Unpublished profiles remain saved in admin but are hidden publicly.</div>
    <div className="grid gap-5">{items.map((p,i)=><Panel key={p.id} title={p.name || "New contributor"} description={p.title || "Add a title or role"} actions={<div className="flex items-center gap-1"><Button variant="ghost" size="icon" aria-label="Move up" disabled={i===0} onClick={()=>move(i,-1)}><ArrowUp className="size-4"/></Button><Button variant="ghost" size="icon" aria-label="Move down" disabled={i===items.length-1} onClick={()=>move(i,1)}><ArrowDown className="size-4"/></Button><Button variant="ghost" size="icon" aria-label={p.published ? "Unpublish profile" : "Publish profile"} onClick={()=>patch(p.id,{published:!p.published})}>{p.published?<Eye className="size-4"/>:<EyeOff className="size-4"/>}</Button><Button variant="ghost" size="icon" aria-label="Delete contributor" onClick={()=>setItems(cur=>cur.filter(x=>x.id!==p.id))}><Trash2 className="size-4 text-destructive"/></Button></div>}>
      <div className="grid gap-4 md:grid-cols-[128px_1fr]"><div className="grid content-start gap-2"><div className="aspect-square overflow-hidden rounded-xl border border-border bg-muted">{p.imageUrl ? <img src={p.imageUrl} alt="" className="h-full w-full object-cover"/> : <div className="grid h-full place-items-center text-xs text-muted-foreground">Profile image</div>}</div><span className="text-center text-xs text-muted-foreground">{p.published?"Published":"Hidden"}</span></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-1.5"><Label>Name</Label><TextField value={p.name} maxLength={100} onChange={e=>patch(p.id,{name:e.target.value})} placeholder="Contributor name"/></div><div className="grid gap-1.5"><Label>Title / role</Label><TextField value={p.title} maxLength={80} onChange={e=>patch(p.id,{title:e.target.value})} placeholder="e.g. Automation Engineer"/></div><div className="grid gap-1.5"><Label>Custom title badge (optional)</Label><TextField value={p.badge} maxLength={40} onChange={e=>patch(p.id,{badge:e.target.value})} placeholder="e.g. Founding Contributor"/></div><div className="grid gap-1.5"><Label>Profile image URL (imgbb)</Label><TextField value={p.imageUrl} onChange={e=>patch(p.id,{imageUrl:e.target.value})} placeholder="https://i.ibb.co/..."/></div><div className="grid gap-1.5 sm:col-span-2"><Label>Description</Label><AreaField rows={3} maxLength={800} value={p.description} onChange={e=>patch(p.id,{description:e.target.value})} placeholder="Describe their contribution to Autumic…"/></div></div></div>
    </Panel>)}
    {!items.length && <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No contributors yet. Select “Add contributor” to create the first profile.</div>}</div>
    {dirty && !valid && <p role="alert" className="mt-4 text-sm text-destructive">Complete each profile with a name, title, description (at least 10 characters), and valid imgbb URL before saving.</p>}
  </AdminPage>;
}
