import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AdminPage, DataTable, Loading, Panel } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminListRoundRobin, adminSaveRoundRobinMember, adminSaveRoundRobinTeam } from "@/lib/round-robin.functions";

export const Route = createFileRoute("/_authenticated/admin/automations/round-robin")({ component: RoundRobinPage });

function RoundRobinPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["admin","round-robin"], queryFn: () => adminListRoundRobin() });
  const saveTeam = useServerFn(adminSaveRoundRobinTeam);
  const saveMember = useServerFn(adminSaveRoundRobinMember);
  const [teamName, setTeamName] = useState("");
  const [strategy, setStrategy] = useState<"round_robin"|"least_assigned"|"least_active"|"priority"|"weighted">("round_robin");
  const [memberTeam, setMemberTeam] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberExternal, setMemberExternal] = useState("");
  const [availability, setAvailability] = useState<"available"|"busy"|"offline"|"paused">("available");
  if (isLoading) return <Loading label="Loading Round-Robin" />;
  if (error) return <Panel title="Round-Robin unavailable">{(error as Error).message}</Panel>;
  const teams = data?.teams ?? [];
  const members = data?.members ?? [];
  const saveNewTeam = async () => {
    if (!teamName.trim() || !data?.clientId) return;
    try { await saveTeam({ data: { clientId:data.clientId, name:teamName.trim(), assignmentStrategy:strategy, active:true, priority:100, fallbackMemberId:null, overflowBehavior:"queue", automationId:null, businessHours:{}, settings:{} } }); setTeamName(""); await qc.invalidateQueries({ queryKey:["admin","round-robin"] }); toast.success("Team created"); } catch(e){ toast.error((e as Error).message); }
  };
  const saveNewMember = async () => {
    if (!memberTeam || !memberName.trim()) return;
    try { await saveMember({ data: { teamId:memberTeam, userId:null, externalAssigneeKey:memberExternal.trim() || null, displayName:memberName.trim(), priority:100, weight:1, availabilityStatus:availability, active:true, maxActive:null, maxDaily:null, metadata:{} } }); setMemberName(""); setMemberExternal(""); await qc.invalidateQueries({ queryKey:["admin","round-robin"] }); toast.success("Member added"); } catch(e){ toast.error((e as Error).message); }
  };
  return <AdminPage title="Round-Robin Management" subtitle="Teams, members, availability, workload caps, fallback behavior and durable assignment history.">
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Create team" description="Round-Robin state is durable in DB4; Redis can accelerate assignment in the worker layer.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input value={teamName} onChange={e=>setTeamName(e.target.value)} placeholder="Team name" />
          <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={strategy} onChange={e=>setStrategy(e.target.value as typeof strategy)}>
            <option value="round_robin">Round Robin</option><option value="least_assigned">Least Assigned</option><option value="least_active">Least Active</option><option value="priority">Priority</option><option value="weighted">Weighted</option>
          </select>
        </div>
        <Button className="mt-3" onClick={()=>void saveNewTeam()}>Create team</Button>
      </Panel>
      <Panel title="Add member" description="Availability and max-active/max-daily enforcement live in the DB4 assignment RPC.">
        <div className="grid gap-3 sm:grid-cols-2">
          <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={memberTeam} onChange={e=>setMemberTeam(e.target.value)}><option value="">Select team</option>{teams.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <Input value={memberName} onChange={e=>setMemberName(e.target.value)} placeholder="Member display name" />
          <Input value={memberExternal} onChange={e=>setMemberExternal(e.target.value)} placeholder="External assignee key (optional)" />
          <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={availability} onChange={e=>setAvailability(e.target.value as typeof availability)}><option value="available">Available</option><option value="busy">Busy</option><option value="offline">Offline</option><option value="paused">Paused</option></select>
        </div>
        <Button className="mt-3" onClick={()=>void saveNewMember()}>Add member</Button>
      </Panel>
    </div>
    <Panel title="Teams"><DataTable head={["Team","Strategy","Active","Priority","Overflow","Members"]} rows={teams.map((t:any)=>[t.name,String(t.assignment_strategy).replace(/_/g," "),t.is_active?"Yes":"No",t.priority,t.overflow_behavior,members.filter((m:any)=>m.team_id===t.id).length])} empty="No Round-Robin teams configured." /></Panel>
    <Panel title="Members"><DataTable head={["Member","Team","Availability","Active","Weight","Current active","Today"]} rows={members.map((m:any)=>[m.display_name,teams.find((t:any)=>t.id===m.team_id)?.name ?? m.team_id,m.availability_status,m.is_active?"Yes":"No",m.weight,m.current_active,m.assigned_today])} empty="No members configured." /></Panel>
    <Panel title="Recent assignments"><DataTable head={["Subject","Member","Strategy","Status","Created"]} rows={(data?.assignments ?? []).slice(0,100).map((a:any)=>[`${a.subject_type}:${a.subject_id}`,members.find((m:any)=>m.id===a.member_id)?.display_name ?? "Unassigned",String(a.strategy).replace(/_/g," "),a.status,new Date(a.created_at).toLocaleString()])} empty="No assignments yet." /></Panel>
  </AdminPage>;
}
