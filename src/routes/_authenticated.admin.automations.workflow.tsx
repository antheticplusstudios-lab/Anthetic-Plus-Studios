import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPage, DataTable, Loading, Panel } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminCreateWorkflowWebhook, adminListWorkflows, adminQueueWorkflowRun, adminSaveWorkflow } from "@/lib/workflow.functions";

export const Route = createFileRoute("/_authenticated/admin/automations/workflow")({ component: WorkflowPage });

function WorkflowPage() {
  const qc=useQueryClient();
  const {data,isLoading,error}=useQuery({queryKey:["admin","workflows"],queryFn:()=>adminListWorkflows()});
  const save=useServerFn(adminSaveWorkflow); const queue=useServerFn(adminQueueWorkflowRun); const createWebhook=useServerFn(adminCreateWorkflowWebhook);
  const [name,setName]=useState(""); const [trigger,setTrigger]=useState("manual"); const [stepsJson,setStepsJson]=useState('[{"stepOrder":0,"stepType":"set","config":{"values":{"ready":true}}}]');
  if(isLoading) return <Loading label="Loading workflows"/>; if(error) return <Panel title="Workflow Automation unavailable">{(error as Error).message}</Panel>;
  const workflows=data?.workflows??[], steps=data?.steps??[], runs=data?.runs??[];
  const create=async()=>{ if(!name.trim()||!data?.clientId)return; try{ const stepsParsed=JSON.parse(stepsJson); await save({data:{clientId:data.clientId,automationId:null,name:name.trim(),description:"",status:"active",triggerType:trigger,triggerConfig:{},steps:stepsParsed}}); setName(""); await qc.invalidateQueries({queryKey:["admin","workflows"]}); toast.success("Workflow created"); }catch(e){toast.error((e as Error).message);} };
  const test=async(id:string)=>{try{await queue({data:{workflowId:id,inputPayload:{source:"admin_test"}}});await qc.invalidateQueries({queryKey:["admin","workflows"]});toast.success("Workflow run queued");}catch(e){toast.error((e as Error).message);}};
  const webhook=async(id:string)=>{try{const result=await createWebhook({data:{workflowId:id}}); window.prompt("Webhook URL (store this securely; it is returned once)", result.endpoint); window.prompt("Signing secret (store this securely; it is returned once)", result.signingSecret); toast.success("Webhook created");}catch(e){toast.error((e as Error).message);}};
  return <AdminPage title="Workflow Automation" subtitle="Durable IF/ELSE-style workflows with queued runs, retries, waits, webhooks, AI steps and usage metering.">
    <Panel title="Create workflow" description="Step config is JSON so the worker can execute the same definition used by runtime triggers.">
      <div className="grid gap-3 sm:grid-cols-2"><Input value={name} onChange={e=>setName(e.target.value)} placeholder="Workflow name"/><Input value={trigger} onChange={e=>setTrigger(e.target.value)} placeholder="Trigger type"/></div>
      <textarea className="mt-3 min-h-40 w-full rounded-md border border-border bg-background p-3 font-mono text-xs" value={stepsJson} onChange={e=>setStepsJson(e.target.value)}/>
      <Button className="mt-3" onClick={()=>void create()}>Create workflow</Button>
    </Panel>
    <Panel title="Definitions"><DataTable head={["Workflow","Status","Trigger","Version","Steps","Updated","Action"]} rows={workflows.map((w:any)=>[w.name,w.status,w.trigger_type,w.version,steps.filter((s:any)=>s.workflow_id===w.id).length,new Date(w.updated_at).toLocaleString(),<div className="flex gap-2"><Button key={w.id} size="sm" variant="outline" onClick={()=>void test(String(w.id))}>Queue test</Button><Button size="sm" variant="outline" onClick={()=>void webhook(String(w.id))}>Create webhook</Button></div>])} empty="No workflows configured."/></Panel>
    <Panel title="Recent runs"><DataTable head={["Workflow","Status","Step","Queued","Completed","Error"]} rows={runs.map((r:any)=>[workflows.find((w:any)=>w.id===r.workflow_id)?.name ?? r.workflow_id,r.status,r.current_step_order,new Date(r.queued_at).toLocaleString(),r.completed_at?new Date(r.completed_at).toLocaleString():"—",r.last_error??"—"])} empty="No workflow runs yet."/></Panel>
  </AdminPage>;
}
