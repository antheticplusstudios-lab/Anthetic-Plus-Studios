import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  adminListAutomations,
  adminListOrders,
  adminListPricing,
  adminListPromos,
  adminListPrompts,
  adminListPaymentMethods,
  adminListStaffInvites,
  adminListCrm,
  adminListProfiles,
  adminListTags,
  adminListAudit,
  adminListUsage,
  adminListTranscripts,
  adminListRoles,
  adminListFailoverLog,
  adminRevokeStaffInvite,
  adminExtendAutomationLifecycle,
  adminSetAutomationKill,
  adminSetAutomationPrompt,
  adminDeletePromo,
  adminCreatePromo,
  adminUpdatePromo,
  adminSavePricing,
  adminSavePaymentMethod,
  adminSavePrompt,
  adminRunLifecycle,
  adminUpdateAutomation,
  adminAddCrmTag,
  adminRemoveCrmTag,
} from "@/lib/admin-data.functions";
import {
  listGroqKeys,
  createGroqKey,
  updateGroqKey,
  deleteGroqKey,
  inviteStaff,
  revokeStaff,
  reviewPayment,
  provisionAutomation,
  runLifecycle,
} from "@/lib/admin.functions";

export const useAllInstances = () =>
  useQuery({ queryKey: ["admin", "automations"], queryFn: () => adminListAutomations() });
export const useAllPayments = () =>
  useQuery({ queryKey: ["admin", "payments"], queryFn: async () => adminListOrders({}) });
export const useAllProfiles = () =>
  useQuery({ queryKey: ["admin", "profiles"], queryFn: () => adminListProfiles() });
export const useTags = () =>
  useQuery({ queryKey: ["admin", "tags"], queryFn: () => adminListTags() });
export const useAuditLog = () =>
  useQuery({ queryKey: ["admin", "audit"], queryFn: () => adminListAudit() });
export const usePricing = () =>
  useQuery({ queryKey: ["admin", "pricing"], queryFn: () => adminListPricing() });
export const usePromos = () =>
  useQuery({ queryKey: ["admin", "promos"], queryFn: () => adminListPromos() });
export const usePrompts = () =>
  useQuery({ queryKey: ["admin", "prompts"], queryFn: () => adminListPrompts() });
export const useFailoverLog = () =>
  useQuery({ queryKey: ["admin", "failover"], queryFn: () => adminListFailoverLog() });
export const useUsage = () =>
  useQuery({ queryKey: ["admin", "usage"], queryFn: () => adminListUsage() });
export const useTranscripts = () =>
  useQuery({ queryKey: ["admin", "transcripts"], queryFn: () => adminListTranscripts() });
export const useRoles = () =>
  useQuery({ queryKey: ["admin", "roles"], queryFn: () => adminListRoles() });
export const useInvites = () =>
  useQuery({ queryKey: ["admin", "invites"], queryFn: () => adminListStaffInvites() });
export const useGroqKeys = () =>
  useQuery({ queryKey: ["admin", "groq-keys"], queryFn: () => listGroqKeys() });

function useAction<TArgs, TResult = unknown>(
  fn: (args: { data: TArgs }) => Promise<TResult>,
  verb: string,
) {
  const queryClient = useQueryClient();
  const call = useServerFn(fn);
  return useMutation({
    mutationFn: (args: TArgs) => call({ data: args }),
    onSuccess: () => {
      toast.success(verb);
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message || "Action failed"),
  });
}

export const useReviewPayment = () => {
  const queryClient = useQueryClient();
  const call = useServerFn(reviewPayment);
  return useMutation({
    mutationFn: (args: { paymentId: string; approve: boolean; reason: string }) =>
      call({ data: args }),
    onSuccess: (res: unknown, args) => {
      toast.success(args.approve ? "Approved & deployed" : "Payment rejected");
      void queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
export const useProvisionAutomation = () =>
  useAction<{ automationId: string }, Awaited<ReturnType<typeof provisionAutomation>>>(
    provisionAutomation,
    "Automation deployed",
  );
export const useRunLifecycle = () =>
  useAction<Record<string, never>, Awaited<ReturnType<typeof runLifecycle>>>(
    runLifecycle,
    "Lifecycle check complete",
  );
export const useCreateGroqKey = () =>
  useAction<{
    label: string;
    keyValue: string;
    isPrimary: boolean;
    provider?: "groq" | "openrouter" | "openai" | "anthropic";
    model?: string | null;
  }>(createGroqKey, "Key added to the pool");
export const useUpdateGroqKey = () =>
  useAction<{ id: string; enabled?: boolean; makePrimary?: boolean; clearCooldown?: boolean }>(
    updateGroqKey,
    "Key updated",
  );
export const useDeleteGroqKey = () => useAction<{ id: string }>(deleteGroqKey, "Key removed");
export const useInviteStaff = () =>
  useAction<{ email: string; role: "partner" | "verifier" | "admin" }>(
    inviteStaff,
    "Invite created",
  );
export const useRevokeStaff = () =>
  useAction<{ userId: string; role: "owner" | "partner" | "admin" | "verifier" | "client" }>(
    revokeStaff,
    "Access revoked",
  );
export const useAdminSavePrompt = () =>
  useAction<{ key: string; content: string }>(adminSavePrompt, "Prompt baseline updated");
export const useAdminUpdateAutomation = () =>
  useAction<{ automationId: string; patch: Record<string, unknown> }>(
    adminUpdateAutomation,
    "Automation updated",
  );
export const useAdminSavePaymentMethod = () =>
  useAction<{
    id: string | null;
    method_name: string;
    instructions: string;
    required_fields: string[];
    is_active: boolean;
  }>(adminSavePaymentMethod, "Payment method saved");
export const useAdminRunLifecycle = () =>
  useAction<undefined>(adminRunLifecycle, "Lifecycle check complete");
export const useAdminAddCrmTag = () =>
  useAction<{ clientId: string; tag: string }>(adminAddCrmTag, "Tag added");
export const useAdminRemoveCrmTag = () =>
  useAction<{ id: string }>(adminRemoveCrmTag, "Tag removed");
export const useAdminSavePricing = () => useAction<unknown>(adminSavePricing, "Pricing plan saved");
export const useAdminUpdatePromo = () =>
  useAction<{ id: string; active: boolean }>(adminUpdatePromo, "Promo updated");
export const useAdminDeletePromo = () =>
  useAction<{ id: string }>(adminDeletePromo, "Promo removed");
export const useAdminCreatePromo = () =>
  useAction<{ code: string; percent_off: number; expires_at: string | null }>(
    adminCreatePromo,
    "Promo created",
  );
export const useAdminRevokeInvite = () =>
  useAction<{ id: string }>(adminRevokeStaffInvite, "Invite revoked");
export const useAdminExtendAutomationLifecycle = () =>
  useAction<{ automationId: string; days: number; graceDays?: number }>(
    adminExtendAutomationLifecycle,
    "Lifecycle extended",
  );
export const useAdminSetAutomationKill = () =>
  useAction<{ automationId: string; killed: boolean; reason?: string }>(
    adminSetAutomationKill,
    "Automation runtime updated",
  );
export const useAdminSetAutomationPrompt = () =>
  useAction<{ automationId: string; prompt: string }>(
    adminSetAutomationPrompt,
    "Automation prompt updated",
  );
