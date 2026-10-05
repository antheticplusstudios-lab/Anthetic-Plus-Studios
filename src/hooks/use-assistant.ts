import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { askAssistant, assistantStatus, saveAssistantSettings } from "@/lib/assistant.functions";

export const useAssistantStatus = () =>
  useQuery({ queryKey: ["assistant", "status"], queryFn: () => assistantStatus(), staleTime: 30_000 });

export const useSaveAssistantSettings = () => {
  const queryClient = useQueryClient();
  const call = useServerFn(saveAssistantSettings);
  return useMutation({
    mutationFn: (args: {
      keyValue?: string | undefined;
      model?: string | undefined;
      clearKey?: boolean;
    }) => call({ data: args }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["assistant"] }),
  });
};

export const useAskAssistant = () => {
  const call = useServerFn(askAssistant);
  return useMutation({
    mutationFn: (question: string) => call({ data: { question } }),
  });
};
