import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { adminRevokeStaffInvite } from "@/lib/admin-data.functions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DangerButton,
  DataTable,
  Field,
  Loading,
  Panel,
  TextField,
  shortDate,
  timeAgo,
} from "@/components/admin-ui";
import {
  useAllProfiles,
  useAuditLog,
  useInvites,
  useInviteStaff,
  useRevokeStaff,
  useRoles,
} from "@/hooks/use-admin";
import { useCurrentUser, useRole } from "@/hooks/use-portal";

export const Route = createFileRoute("/_authenticated/admin/team")({
  component: TeamManagement,
});

const roleDescriptions: Record<string, string> = {
  partner: "Full control-center access, cannot wipe data or create other partners.",
  admin: "Operational access to automations, infrastructure and payments.",
  verifier: "Verification queue only — reviews payment submissions.",
};

function TeamManagement() {
  const { data: roles = [], isLoading: rolesLoading } = useRoles();
  const { data: invites = [], isLoading: invitesLoading } = useInvites();
  const { data: profiles = [], isLoading: profilesLoading } = useAllProfiles();
  const { data: auditLog = [], isLoading: auditLoading } = useAuditLog();
  const { data: currentUser } = useCurrentUser();
  const { data: myRole } = useRole();
  const inviteStaff = useInviteStaff();
  const revokeStaff = useRevokeStaff();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"partner" | "verifier" | "admin">("verifier");
  const [filter, setFilter] = useState("");

  if (rolesLoading || invitesLoading || profilesLoading || auditLoading) return <Loading />;

  const profileByUserId = new Map(profiles.map((p) => [p.user_id, p]));

  const cancelInvite = async (id: string) => {
    try {
      await adminRevokeStaffInvite({ data: { id } });
      toast.success("Invite revoked");
      void queryClient.invalidateQueries({ queryKey: ["admin", "invites"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revoke invite.");
    }
  };

  const peopleRows = roles.map((r) => {
    const profile = profileByUserId.get(r.user_id);
    const isSelf = r.user_id === currentUser?.id;
    const isOwner = r.role === "owner";
    return [
      <span className="font-bold capitalize" key="role">
        {r.role}
      </span>,
      profile?.company_name || "—",
      isSelf ? currentUser?.email : "—",
      isOwner || isSelf ? (
        <span className="text-xs text-muted-foreground" key="none">
          —
        </span>
      ) : (
        <DangerButton
          key="revoke"
          size="sm"
          onClick={() => {
            const roleToRevoke = (
              ["owner", "partner", "admin", "verifier", "client"] as const
            ).find((candidate) => candidate === r.role);
            if (roleToRevoke) revokeStaff.mutate({ userId: r.user_id, role: roleToRevoke });
          }}
        >
          Revoke
        </DangerButton>
      ),
    ];
  });

  const filteredAudit = auditLog.filter((a) => {
    if (!filter.trim()) return true;
    const needle = filter.toLowerCase();
    return (
      a.action?.toLowerCase().includes(needle) ||
      (a.actor_email ?? "").toLowerCase().includes(needle)
    );
  });

  return (
    <div className="page-enter space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Team Management & Audit Trail</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Who can reach the control center, and an immutable record of what they did.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Invite staff" description="Partners can only be created by the Owner">
          <div className="grid gap-4">
            <Field label="Email">
              <TextField
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </Field>
            <Field label="Role" hint={roleDescriptions[role]}>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="verifier">Verifier</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Button
              onClick={() => {
                if (!email.trim()) {
                  toast.error("Enter an email address");
                  return;
                }
                inviteStaff.mutate(
                  { email: email.trim(), role },
                  { onSuccess: () => setEmail("") },
                );
              }}
              disabled={inviteStaff.isPending}
            >
              Send invite
            </Button>
          </div>

          <div className="mt-6">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Pending invites
            </p>
            <DataTable
              head={["Email", "Role", "Created", ""]}
              rows={invites.map((i) => [
                i.email,
                <span className="capitalize" key="r">
                  {i.role}
                </span>,
                shortDate(i.created_at),
                <Button
                  key="cancel"
                  size="sm"
                  variant="outline"
                  onClick={() => void cancelInvite(i.id)}
                >
                  Cancel
                </Button>,
              ])}
              empty="No pending invites."
            />
          </div>
        </Panel>

        <Panel title="People with access">
          <DataTable
            head={["Role", "Company", "Email", ""]}
            rows={peopleRows}
            empty="No staff roles assigned."
          />
        </Panel>
      </div>

      <Panel
        title="Audit trail (immutable)"
        description="Rows cannot be edited or deleted"
        actions={
          <TextField
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by action or actor"
            className="w-56"
          />
        }
      >
        <DataTable
          head={["When", "Action", "Actor", "Target", "Details"]}
          rows={filteredAudit.map((a) => [
            timeAgo(a.created_at),
            a.action,
            a.actor_email,
            a.target,
            <span className="block max-w-xs truncate text-xs text-muted-foreground" key="d">
              {JSON.stringify(a.details ?? {})}
            </span>,
          ])}
          empty="No audit events recorded."
        />
      </Panel>
    </div>
  );
}
