import { describe, expect, it } from "vitest";
import { contactSchema, looksLikeSpam } from "@/lib/contact-schema";

const base = {
  name: "Ada",
  email: "ada@example.com",
  topic: "sales",
  message: "Hello there, interested.",
  startedAt: 1,
};

describe("contact form rules", () => {
  it("rejects an invalid email", () => {
    expect(contactSchema.safeParse({ ...base, email: "nope" }).success).toBe(false);
  });
  it("flags a filled honeypot as spam", () => {
    expect(looksLikeSpam({ website: "x", startedAt: 0 }, 10_000)).toBe(true);
  });
  it("flags submissions faster than 3 seconds as spam", () => {
    expect(looksLikeSpam({ website: "", startedAt: 9_000 }, 10_000)).toBe(true);
    expect(looksLikeSpam({ website: "", startedAt: 1_000 }, 10_000)).toBe(false);
  });
});
