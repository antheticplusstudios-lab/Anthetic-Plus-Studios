import { z } from "zod";

export const contributorSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(2).max(100),
  title: z.string().trim().min(2).max(80),
  badge: z.string().trim().max(40).default(""),
  description: z.string().trim().min(10).max(800),
  imageUrl: z.string().url().max(1000).refine((v) => /^https:\/\/(i\.)?ibb\.co\//i.test(v) || /^https:\/\/i\.ibb\.co\//i.test(v), "Use a valid imgbb image URL."),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  published: z.boolean().default(true),
});
export const contributionsSchema = z.array(contributorSchema).max(100);
export type Contributor = z.infer<typeof contributorSchema>;
export const DEFAULT_CONTRIBUTIONS: Contributor[] = [];
