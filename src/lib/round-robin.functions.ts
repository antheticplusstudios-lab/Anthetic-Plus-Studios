import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/rbac.server";
import { auditMutation } from "@/lib/platform-access.server";
import { db4Admin } from "@/server/db/clients.server";

export const adminListRoundRobin = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  assertAdmin(context);
  let q = db4Admin.from("round_robin_teams").select("*").order("priority", { ascending: false }).order("created_at", { ascending: true });
  if (!context.tenant.isSuperAdmin) q = q.eq("client_id", context.tenant.clientId);
  const { data: teams, error } = await q;
  if (error) throw new Error(error.message);
  const ids = (teams ?? []).map((t: any) => String(t.id));
  const members = ids.length ? await db4Admin.from("round_robin_members").select("*").in("team_id", ids).order("priority", { ascending: false }) : { data: [], error: null };
  if (members.error) throw new Error(members.error.message);
  const assignments = ids.length ? await db4Admin.from("round_robin_assignments").select("*").in("team_id", ids).order("created_at", { ascending: false }).limit(250) : { data: [], error: null };
  if (assignments.error) throw new Error(assignments.error.message);
  return { clientId: context.tenant.clientId, teams: teams ?? [], members: members.data ?? [], assignments: assignments.data ?? [] };
});

export const adminSaveRoundRobinTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    id: z.string().uuid().nullable().default(null), clientId: z.string().uuid(), automationId: z.string().uuid().nullable().default(null), name: z.string().min(1).max(120),
    assignmentStrategy: z.enum(["round_robin","least_assigned","least_active","priority","weighted","manual_override"]), active: z.boolean(), priority: z.number().int().min(-100000).max(100000),
    fallbackMemberId: z.string().uuid().nullable().default(null), overflowBehavior: z.enum(["queue","fallback","unassigned","manual"]), businessHours: z.record(z.string(), z.unknown()).default({}), settings: z.record(z.string(), z.unknown()).default({}),
  }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    if (!context.tenant.isSuperAdmin && data.clientId !== context.tenant.clientId) throw new Error("Outside your client scope");
    const row = { client_id: data.clientId, automation_id: data.automationId, name: data.name.trim(), assignment_strategy: data.assignmentStrategy, is_active: data.active, priority: data.priority, fallback_member_id: data.fallbackMemberId, overflow_behavior: data.overflowBehavior, business_hours: data.businessHours, settings: data.settings };
    const result = data.id ? await db4Admin.from("round_robin_teams").update(row).eq("id", data.id).select("id").single() : await db4Admin.from("round_robin_teams").insert(row).select("id").single();
    if (result.error) throw new Error(result.error.message);
    await auditMutation(context, { action: data.id ? "round_robin.team.updated" : "round_robin.team.created", targetType: "round_robin_team", targetId: result.data?.id ?? data.id, clientId: data.clientId, after: row });
    return { ok: true, id: result.data?.id ?? data.id };
  });

export const adminSaveRoundRobinMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    id: z.string().uuid().nullable().default(null), teamId: z.string().uuid(), userId: z.string().uuid().nullable().default(null), externalAssigneeKey: z.string().max(160).nullable().default(null), displayName: z.string().min(1).max(120), priority: z.number().int().min(-100000).max(100000), weight: z.number().int().min(1).max(1000), availabilityStatus: z.enum(["available","busy","offline","paused"]), active: z.boolean(), maxActive: z.number().int().min(1).nullable().default(null), maxDaily: z.number().int().min(1).nullable().default(null), metadata: z.record(z.string(), z.unknown()).default({}),
  }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { data: team } = await db4Admin.from("round_robin_teams").select("client_id").eq("id", data.teamId).maybeSingle();
    if (!team || (!context.tenant.isSuperAdmin && String(team.client_id) !== context.tenant.clientId)) throw new Error("Team not found");
    const row = { team_id: data.teamId, user_id: data.userId, external_assignee_key: data.externalAssigneeKey, display_name: data.displayName.trim(), priority: data.priority, weight: data.weight, availability_status: data.availabilityStatus, is_active: data.active, max_active: data.maxActive, max_daily: data.maxDaily, metadata: data.metadata };
    const result = data.id ? await db4Admin.from("round_robin_members").update(row).eq("id", data.id).select("id").single() : await db4Admin.from("round_robin_members").insert(row).select("id").single();
    if (result.error) throw new Error(result.error.message);
    await auditMutation(context, { action: data.id ? "round_robin.member.updated" : "round_robin.member.created", targetType: "round_robin_member", targetId: result.data?.id ?? data.id, clientId: String(team.client_id), after: row });
    return { ok: true, id: result.data?.id ?? data.id };
  });

export const adminAssignRoundRobin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ teamId: z.string().uuid(), subjectType: z.enum(["lead","conversation","appointment","handoff","support"]), subjectId: z.string().uuid(), strategy: z.enum(["round_robin","least_assigned","least_active","priority","weighted","manual_override"]).nullable().default(null), manualMemberId: z.string().uuid().nullable().default(null) }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { data: team } = await db4Admin.from("round_robin_teams").select("client_id").eq("id", data.teamId).maybeSingle();
    if (!team || (!context.tenant.isSuperAdmin && String(team.client_id) !== context.tenant.clientId)) throw new Error("Team not found");
    const { data: result, error } = await db4Admin.rpc("assign_round_robin", { p_team_id: data.teamId, p_subject_type: data.subjectType, p_subject_id: data.subjectId, p_strategy: data.strategy, p_manual_member_id: data.manualMemberId });
    if (error) throw new Error(error.message);
    await auditMutation(context, { action: "round_robin.assignment.created", targetType: "round_robin_team", targetId: data.teamId, clientId: String(team.client_id), after: result });
    return { result };
  });
