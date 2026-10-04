import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AdminPage, DataTable, Loading, Panel, StatusPill, shortDate } from "@/components/admin-ui";
import { useAllInstances, useAdminExtendAutomationLifecycle, useRunLifecycle } from "@/hooks/use-admin";

export const Route = createFileRoute("/_authenticated/admin/lifecycle")({ component: LifecyclePage });

type Instance = { id:string; clientName?:string; user_id?:string; status:string; billing_plan:string; expires_at:string|null; grace_days:number; warning_sent:boolean };
function ExtendControl({ instance }:{instance:Instance}){
  const [busy,setBusy]=useState(false); const extend=useAdminExtendAutomationLifecycle();
  const change=async(days:number)=>{setBusy(true);try{await extend.mutateAsync({automationId:instance.id,days});}finally{setBusy(false);}};
  return <div className="flex items-center gap-2"><span className="tabular-nums text-xs text-muted-foreground">Grace: {instance.grace_days}d</span><Button size="sm" variant="outline" disabled={busy} onClick={()=>void change(1)}>+1 grace</Button><Button size="sm" disabled={busy} onClick={()=>void change(7)}>+7 days</Button></div>;
}
function LifecyclePage(){
 const {data:instances,isLoading}=useAllInstances(); const runLifecycle=useRunLifecycle(); if(isLoading)return <Loading/>; const rows=(instances??[]) as Instance[];
 return <AdminPage title="Subscription Lifecycle Controller" subtitle="Server-authorized lifecycle state, grace periods and manual extensions." actions={<Button onClick={()=>runLifecycle.mutate({})} disabled={runLifecycle.isPending}>{runLifecycle.isPending?"Running…":"Run lifecycle check now"}</Button>}>
  <Panel title="Lifecycle rules"><div className="grid gap-3 sm:grid-cols-3">{[["Renewal window","Warn before expiration"],["Past due","Subscription enters billing recovery"],["Grace exhausted","Automation is suspended server-side"]].map(([a,b])=><div key={a} className="rounded-xl border border-border bg-secondary/40 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{a}</p><p className="mt-1 text-sm">{b}</p></div>)}</div></Panel>
  <Panel title={`Automations (${rows.length})`}><DataTable head={["Client","Status","Plan","Expires","Grace","Warning","Extend"]} empty="No automations yet." rows={rows.map(i=>[i.clientName||i.user_id?.slice(0,8)||"—",<StatusPill status={i.status} key="s"/>,i.billing_plan,shortDate(i.expires_at),i.grace_days,i.warning_sent?"Sent":"Not yet",<ExtendControl key="e" instance={i}/>])}/></Panel>
 </AdminPage>;
}
