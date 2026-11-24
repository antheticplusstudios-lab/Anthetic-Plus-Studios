import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Profile } from "@/lib/portal";
import {
  getMyProfile,
  getMyAutomations,
  getMyOrders,
  getMyAccountContext,
} from "@/lib/client-platform.functions";

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
    staleTime: 60_000,
  });
}

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async (): Promise<Profile | null> => (await getMyProfile()) as Profile | null,
  });
}

export function useRole() {
  return useQuery({
    queryKey: ["roles"],
    queryFn: async (): Promise<AppRole> => {
      const account = await getMyAccountContext();
      const rawRoles = (account as { roles?: unknown }).roles;
      const roles: string[] = Array.isArray(rawRoles)
        ? rawRoles.map((r: unknown) => String(r).toLowerCase())
        : [];
      const primary = String(account.role ?? "").toLowerCase();

      if (roles.includes("owner") || primary === "owner") return "owner";
      if (roles.includes("admin") || primary === "admin" || account.isSuperAdmin) return "admin";
      if (roles.includes("partner") || primary === "partner") return "partner";
      if (roles.includes("verifier") || primary === "verifier") return "verifier";
      return "client";
    },
  });
}

export function useInstances() {
  return useQuery({
    queryKey: ["instances"],
    queryFn: async () => getMyAutomations(),
  });
}

export function useMyPayments() {
  return useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => getMyOrders(),
  });
}
