import { z } from "zod";
import { defineTool, type ToolContext } from "../assistant.registry.server";

const input = z.object({
  query: z.string().trim().max(240),
});

const MEMBER_GUIDE = [
  {
    path: "/dashboard",
    title: "Dashboard overview",
    help: "See your account overview, active services, and the main dashboard shortcuts.",
  },
  {
    path: "/dashboard/profile",
    title: "Profile",
    help: "Review or complete your company profile and contact details.",
  },
  {
    path: "/dashboard/orders",
    title: "Orders",
    help: "Review orders and their current processing or verification status.",
  },
  {
    path: "/dashboard/payments",
    title: "Payments",
    help: "Review payment methods and payment-related information available to your account.",
  },
  {
    path: "/dashboard/automations",
    title: "Automations",
    help: "Review your automations, status, and available automation controls.",
  },
];

const STAFF_GUIDE = [
  {
    path: "/admin",
    title: "Admin control center",
    help: "Operational overview and administration tools.",
  },
  {
    path: "/admin/crm",
    title: "Client CRM & Tags",
    help: "Manage client records and operational tags.",
  },
  {
    path: "/admin/clients",
    title: "Clients",
    help: "Review client accounts and account-level administration.",
  },
  {
    path: "/admin/orders",
    title: "Orders",
    help: "Review and verify orders.",
  },
  {
    path: "/admin/automations",
    title: "Automations",
    help: "Manage automation operations and configuration.",
  },
  {
    path: "/admin/voice-agent",
    title: "AI Voice Agent",
    help: "Configure website assistant, voice, and email delivery settings.",
  },
  {
    path: "/admin/knowledge",
    title: "Knowledge",
    help: "Manage approved AI knowledge and sources.",
  },
  {
    path: "/admin/team",
    title: "Team",
    help: "Manage staff access and invitations.",
  },
  {
    path: "/admin/settings",
    title: "Settings",
    help: "Review platform and assistant settings.",
  },
];

export const dashboardGuideTool = defineTool<z.infer<typeof input>>({
  name: "get_dashboard_guide",
  label: "Dashboard guide",
  description:
    "Explain where a signed-in AntheticPlus user can find a dashboard feature. Use this when the user asks how to do something in the dashboard or where a setting/page is located.",
  inputDoc: '{"query":"short description of what the user wants to find"}',
  access: "member",
  sideEffect: false,
  input,
  async execute(data, ctx: ToolContext) {
    const entries = ctx.auth?.tenant.isStaff ? [...MEMBER_GUIDE, ...STAFF_GUIDE] : MEMBER_GUIDE;
    const query = data.query.toLowerCase();
    const matches = query
      ? entries.filter((entry) =>
          `${entry.path} ${entry.title} ${entry.help}`.toLowerCase().includes(query),
        )
      : entries;
    return {
      ok: true,
      summary: `Found ${matches.length} dashboard location(s).`,
      data: matches.slice(0, 8),
    };
  },
});
