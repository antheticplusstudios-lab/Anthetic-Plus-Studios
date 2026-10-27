import { describe, expect, it } from "vitest";
import { automations } from "@/lib/automations";
import {
  availableSolutions,
  DEFAULT_SOLUTIONS,
  solutionsListSchema,
  solutionSchema,
} from "@/lib/solutions";

describe("product solutions rules", () => {
  it("accepts every existing product as an editable destination", () => {
    for (const product of automations) {
      expect(solutionSchema.parse({ ...DEFAULT_SOLUTIONS[0], slug: product.slug }).slug).toBe(
        product.slug,
      );
    }
  });
  it("rejects a destination not offered in the product catalog", () => {
    expect(
      solutionSchema.safeParse({ ...DEFAULT_SOLUTIONS[0], slug: "unavailable-product" }).success,
    ).toBe(false);
  });
  it("rejects unknown and inherited icon names", () => {
    for (const icon of ["invalid", "toString", "constructor"])
      expect(solutionSchema.safeParse({ ...DEFAULT_SOLUTIONS[0], icon }).success).toBe(false);
  });
  it("preserves deleting every solution as an intentionally empty configuration", () => {
    expect(solutionsListSchema.parse([])).toEqual([]);
    expect(availableSolutions([])).toEqual([]);
  });
  it("supports adding, editing and removing cards without deleting the product", () => {
    const added = solutionSchema.parse({ ...DEFAULT_SOLUTIONS[0], id: "new-solution" });
    const list = solutionsListSchema.parse([...DEFAULT_SOLUTIONS, added]);
    const edited = solutionsListSchema.parse(
      list.map((item) => (item.id === added.id ? { ...item, slug: "social-dm-assistant" } : item)),
    );
    expect(edited.find((item) => item.id === added.id)?.slug).toBe("social-dm-assistant");
    expect(solutionsListSchema.parse(edited.filter((item) => item.id !== added.id))).toHaveLength(
      DEFAULT_SOLUTIONS.length,
    );
    expect(automations.some((item) => item.slug === added.slug)).toBe(true);
  });
  it("rejects duplicate card IDs", () => {
    expect(
      solutionsListSchema.safeParse([DEFAULT_SOLUTIONS[0], DEFAULT_SOLUTIONS[0]]).success,
    ).toBe(false);
  });
  it("shows only the two publicly available products when pricing is offline", () => {
    expect([...new Set(availableSolutions(DEFAULT_SOLUTIONS).map((item) => item.slug))]).toEqual([
      "voice-sms-receptionist",
      "social-dm-assistant",
    ]);
  });
  it("hides inactive and unlisted products, and allows a newly listed product", () => {
    const plans = [
      { slug: "voice-sms-receptionist", active: false, listed: true },
      { slug: "social-dm-assistant", active: true, listed: false },
      { slug: "lead-capture-qualifier", active: true, listed: true },
      { slug: "knowledge-base-support", active: false, listed: false },
    ];
    expect(availableSolutions(DEFAULT_SOLUTIONS, plans).map((item) => item.slug)).toEqual([
      "lead-capture-qualifier",
    ]);
  });
});
