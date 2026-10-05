import { useQuery } from "@tanstack/react-query";
import { getSystemSettings } from "@/lib/admin-data.functions";

export type SettingsMap = Record<string, Record<string, unknown>>;
export type BannerSetting = { enabled?: boolean; message?: string; tone?: string };
export type MaintenanceSetting = { enabled?: boolean; message?: string };

export const systemSettingsQueryOptions = {
  queryKey: ["system-settings-public"] as const,
  queryFn: async (): Promise<SettingsMap> => (await getSystemSettings()) as SettingsMap,
  staleTime: 30_000,
};

export function useSystemSettings() { return useQuery(systemSettingsQueryOptions); }
export function useBanner(): BannerSetting { const { data } = useSystemSettings(); return (data?.banner ?? {}) as BannerSetting; }
export function useMaintenance(): MaintenanceSetting { const { data } = useSystemSettings(); return (data?.maintenance ?? {}) as MaintenanceSetting; }
export function useFeatureFlag(key: string): boolean { const { data } = useSystemSettings(); const flags = (data?.feature_flags ?? {}) as Record<string, unknown>; return flags[key] !== false; }
