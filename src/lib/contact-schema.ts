import { z } from "zod";

/** Shared contact form rules (client + server). */
export const CONTACT_TOPICS = ["sales", "support", "partnership", "billing", "other"] as const;

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(100),
  email: z.string().trim().email("Enter a valid email").max(254),
  company: z.string().trim().max(120).optional().default(""),
  topic: z.enum(CONTACT_TOPICS),
  message: z.string().trim().min(10, "Please write at least 10 characters").max(2000),
  /** Honeypot: real users never fill this. */
  website: z.string().max(0).optional().default(""),
  /** ms timestamp when the form was rendered — submissions under 3s are treated as bots. */
  startedAt: z.number().int().positive(),
});

export type ContactInput = z.infer<typeof contactSchema>;

export const MIN_FILL_MS = 3000;

export function looksLikeSpam(
  input: Pick<ContactInput, "website" | "startedAt">,
  now = Date.now(),
) {
  if (input.website) return true;
  return now - input.startedAt < MIN_FILL_MS;
}
