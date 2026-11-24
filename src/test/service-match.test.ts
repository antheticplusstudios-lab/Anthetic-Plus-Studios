import { describe, expect, it } from "vitest";
import { normalizeDraft, parseServices } from "@/lib/service-match";

const services = parseServices("- AC Repair\n2. Duct Cleaning\nac repair\n\nInstallation");

describe("service matcher", () => {
  it("reads the client's services one per line, deduped", () => {
    expect(services).toEqual(["AC Repair", "Duct Cleaning", "Installation"]);
  });
  it("rejects a service the business does not offer", () => {
    const d = normalizeDraft(services, { service: "Plumbing", confidence: "high" });
    expect(d.service).toBeNull();
    expect(d.confidence).toBe("low");
    expect(d.readyToBook).toBe(false);
    expect(d.missing).toContain("service");
  });
  it("is ready to book only with service, date and time", () => {
    const d = normalizeDraft(services, {
      service: "ac repair",
      confidence: "high",
      details: { preferredDate: "2026-10-15", preferredTime: "14:00" },
    });
    expect(d.service).toBe("AC Repair");
    expect(d.readyToBook).toBe(true);
    expect(
      normalizeDraft(services, { service: "AC Repair", details: { preferredDate: "Thu" } })
        .readyToBook,
    ).toBe(false);
  });
  it("drops invented alternatives", () => {
    expect(
      normalizeDraft(services, { service: "AC Repair", alternatives: ["Roofing", "Installation"] })
        .alternatives,
    ).toEqual(["Installation"]);
  });
  it("does not block readiness on optional caller details", () => {
    const d = normalizeDraft(services, {
      service: "AC Repair",
      confidence: "high",
      details: { preferredDate: "2026-10-15", preferredTime: "14:00" },
      missing: ["customer name", "location", "people"],
      questions: ["What is your address?"],
    });
    expect(d.readyToBook).toBe(true);
    expect(d.missing).toContain("customer name");
    expect(d.missing).toContain("location");
  });
  it("never marks a draft ready when the date or time is absent", () => {
    expect(
      normalizeDraft(services, {
        service: "AC Repair",
        details: { preferredDate: "2026-10-15" },
      }).readyToBook,
    ).toBe(false);
    expect(
      normalizeDraft(services, {
        service: "AC Repair",
        details: { preferredTime: "14:00" },
      }).readyToBook,
    ).toBe(false);
  });
});
