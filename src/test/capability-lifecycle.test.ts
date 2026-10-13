import { describe, expect, it } from "vitest";
import {
  adminDecide,
  adminList,
  adminRevoke,
  adminRollback,
  adminRecheck,
  adminTest,
  clientSubmit,
  clientView,
  type CapabilityDeps,
  type AutomationRef,
} from "@/lib/capability-service.server";
import { activeToolIds, connectedNeeds, type ActivationState } from "@/lib/capability-lifecycle";
import { RECEPTIONIST_SERVICES, TOOL_CATALOG, type IntegrationNeed } from "@/lib/tool-catalog";
import { parseProposal } from "@/lib/tool-builder.server";

const tenant = (o: Partial<Record<string, unknown>> = {}) =>
  ({
    clientId: "A",
    isStaff: false,
    isPlatformAdmin: false,
    isSuperAdmin: false,
    isBanned: false,
    isSuspended: false,
    ...o,
  }) as never;
const clientA = { userId: "u-a", tenant: tenant() };
const clientB = { userId: "u-b", tenant: tenant({ clientId: "B" }) };
const admin = {
  userId: "adm",
  tenant: tenant({ clientId: "X", isStaff: true, isPlatformAdmin: true, isSuperAdmin: true }),
};

function deps(connected: IntegrationNeed[] = []) {
  const autos: Record<string, AutomationRef> = {
    r1: { id: "r1", clientId: "A", kind: "ai_receptionist", name: "Receptionist" },
    s1: { id: "s1", clientId: "B", kind: "kb_support", name: "Support" },
  };
  const req: Record<string, never[]> = {};
  const act: Record<string, ActivationState> = {};
  const audits: string[] = [];
  let n = 0;
  const conn = new Set(connected);
  const d: CapabilityDeps = {
    getAutomation: async (id) => autos[id] ?? null,
    listAutomationIdsWithRequests: async () => Object.keys(req),
    readRequests: async (id) => structuredClone(req[id] ?? []),
    writeRequests: async (id, l) => void (req[id] = structuredClone(l) as never),
    readActivation: async (id) => structuredClone(act[id] ?? null),
    writeActivation: async (id, s) => void (act[id] = structuredClone(s)),
    connected: async () => new Set(conn),
    audit: async (_c, a) => void audits.push(a),
    now: () => "2026-10-12T00:00:00Z",
    uuid: () => `00000000-0000-0000-0000-00000000000${++n}`,
  };
  return { d, act, audits, conn };
}

const raw = {
  summary: "Book and remind",
  tools: [
    { id: "create_booking", reason: "book", inputs: ["name"] },
    { id: "list_services", reason: "prices", inputs: [] },
    { id: "rm_rf", reason: "evil", inputs: [] },
  ],
  unsupported: [],
};

describe("capability request lifecycle", () => {
  it("client submission drops unknown tools and records pending status", async () => {
    const { d } = deps();
    const r = await clientSubmit(d, clientA, "r1", "book haircuts", raw);
    expect(r.status).toBe("pending_approval");
    expect(r.proposal.tools.map((t) => t.id)).toEqual(["create_booking", "list_services"]);
    expect(r.proposal.unsupported.join()).toContain("rm_rf");
  });

  it("blocks cross-tenant submission and viewing", async () => {
    const { d } = deps();
    await expect(clientSubmit(d, clientB, "r1", "x", raw)).rejects.toThrow("not found");
    await expect(clientView(d, clientB, "r1")).rejects.toThrow("not found");
  });

  it("non-admins cannot list, approve, revoke or roll back", async () => {
    const { d } = deps();
    const r = await clientSubmit(d, clientA, "r1", "book", raw);
    await expect(adminList(d, clientA)).rejects.toBeInstanceOf(Response);
    await expect(
      adminDecide(d, clientA, "r1", r.id, "approved", "ok please"),
    ).rejects.toBeInstanceOf(Response);
    await expect(adminRevoke(d, clientA, "r1", "list_services", "")).rejects.toBeInstanceOf(
      Response,
    );
    await expect(adminRollback(d, clientA, "r1", 1)).rejects.toBeInstanceOf(Response);
  });

  it("approval activates only tools whose integrations exist; missing ones stay blocked", async () => {
    const { d, act } = deps();
    const r = await clientSubmit(d, clientA, "r1", "book", raw);
    const res = await adminDecide(d, admin, "r1", r.id, "approved", "Looks good");
    const tools = Object.fromEntries(res.activation!.tools.map((t) => [t.toolId, t]));
    expect(tools.list_services!.status).toBe("active");
    expect(tools.create_booking!.status).toBe("blocked");
    expect(tools.create_booking!.needs).toBe("calendar");
    expect(activeToolIds(act.r1!)).toEqual(new Set(["list_services"]));
  });

  it("requires a reason and refuses double decisions", async () => {
    const { d } = deps();
    const r = await clientSubmit(d, clientA, "r1", "book", raw);
    await expect(adminDecide(d, admin, "r1", r.id, "rejected", "")).rejects.toThrow("reason");
    await adminDecide(d, admin, "r1", r.id, "rejected", "Not offered");
    await expect(adminDecide(d, admin, "r1", r.id, "approved", "again")).rejects.toThrow("already");
  });

  it("rejection stays visible to the client with its reason and activates nothing", async () => {
    const { d, act } = deps();
    const r = await clientSubmit(d, clientA, "r1", "book", raw);
    await adminDecide(d, admin, "r1", r.id, "rejected", "We don't support that yet");
    const v = await clientView(d, clientA, "r1");
    expect(v.requests[0]!.status).toBe("rejected");
    expect(v.requests[0]!.decisionNote).toBe("We don't support that yet");
    expect(act.r1).toBeUndefined();
  });

  it("recheck activates a blocked tool once its integration connects; test reports readiness", async () => {
    const { d, conn } = deps();
    const r = await clientSubmit(d, clientA, "r1", "book", raw);
    await adminDecide(d, admin, "r1", r.id, "approved", "ok go");
    let s = await adminTest(d, admin, "r1", "create_booking");
    expect(s.tools.find((t) => t.toolId === "create_booking")!.lastTest!.ok).toBe(false);
    conn.add("calendar");
    s = await adminRecheck(d, admin, "r1");
    expect(activeToolIds(s).has("create_booking")).toBe(true);
    s = await adminTest(d, admin, "r1", "create_booking");
    expect(s.tools.find((t) => t.toolId === "create_booking")!.lastTest!.ok).toBe(true);
  });

  it("revocation disables a tool and rollback restores an earlier version", async () => {
    const { d, audits } = deps(["calendar"]);
    const r = await clientSubmit(d, clientA, "r1", "book", raw);
    const { activation } = await adminDecide(d, admin, "r1", r.id, "approved", "ok go");
    let s = await adminRevoke(d, admin, "r1", "create_booking", "abuse");
    expect(activeToolIds(s).has("create_booking")).toBe(false);
    s = await adminRecheck(d, admin, "r1");
    expect(activeToolIds(s).has("create_booking")).toBe(false); // revoked stays revoked
    s = await adminRollback(d, admin, "r1", activation!.version);
    expect(activeToolIds(s).has("create_booking")).toBe(true);
    expect(audits).toContain("automation.capability.rollback");
  });

  it("each automation keeps its own registry: receptionist tools can't be approved for support", async () => {
    const { d } = deps();
    const supportAdminReq = await clientSubmit(
      d,
      { userId: "u-b", tenant: tenant({ clientId: "B" }) },
      "s1",
      "book",
      raw,
    );
    expect(supportAdminReq.proposal.tools).toEqual([]);
  });
});

describe("receptionist services & integrations", () => {
  it("covers all ten service areas with real catalog tools", () => {
    expect(RECEPTIONIST_SERVICES).toHaveLength(10);
    const ids = new Set(TOOL_CATALOG.ai_receptionist.map((t) => t.id));
    for (const s of RECEPTIONIST_SERVICES) for (const t of s.tools) expect(ids.has(t)).toBe(true);
  });
  it("maps connections and settings to integration needs", () => {
    const c = connectedNeeds(
      ["twilio"],
      { payment_link_url: "https://pay.example" },
      { resend: false },
    );
    expect([...c].sort()).toEqual(["payments", "sms", "telephony"]);
  });
  it("parses model JSON safely", () => {
    expect(parseProposal('```json\n{"summary":"s","tools":[{"id":"x"}]}\n```').tools[0]!.id).toBe(
      "x",
    );
    expect(() => parseProposal("nope")).toThrow();
  });
});
