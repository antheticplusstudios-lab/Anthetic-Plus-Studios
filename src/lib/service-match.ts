/** Pure rules for turning a caller's description into a service + booking draft. Browser-safe. */

export type BookingDraft = {
  service: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
  alternatives: string[];
  details: {
    preferredDate: string | null;
    preferredTime: string | null;
    people: number | null;
    location: string | null;
    notes: string | null;
  };
  missing: string[];
  questions: string[];
  /** True only when a configured service was matched and nothing required is missing. */
  readyToBook: boolean;
};

/** Services come from the client's own "Services" setting, one per line. */
export function parseServices(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const name = line.replace(/^[\s\-*•\d.)]+/, "").trim();
    if (!name || name.length > 200) continue;
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(name);
  }
  return out.slice(0, 60);
}

const str = (v: unknown, max = 300) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/** Only accept a service that exactly (case-insensitively) matches the client's list. */
function pick(services: string[], v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  return services.find((x) => x.toLowerCase() === s.toLowerCase()) ?? null;
}

export function normalizeDraft(services: string[], raw: unknown): BookingDraft {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = (r.details && typeof r.details === "object" ? r.details : {}) as Record<
    string,
    unknown
  >;
  const service = pick(services, r.service);
  const conf = r.confidence === "high" || r.confidence === "medium" ? r.confidence : "low";
  const people = Number(d.people);
  const details = {
    preferredDate: str(d.preferredDate, 60),
    preferredTime: str(d.preferredTime, 60),
    people: Number.isInteger(people) && people > 0 && people < 1000 ? people : null,
    location: str(d.location, 160),
    notes: str(d.notes, 500),
  };
  const missing = new Set(
    (Array.isArray(r.missing) ? r.missing : [])
      .map((x) => str(x, 80))
      .filter((x): x is string => !!x),
  );
  if (!service) missing.add("service");
  if (!details.preferredDate) missing.add("preferred date");
  if (!details.preferredTime) missing.add("preferred time");
  const alternatives = (Array.isArray(r.alternatives) ? r.alternatives : [])
    .map((x) => pick(services, x))
    .filter((x): x is string => !!x && x !== service)
    .slice(0, 3);
  return {
    service,
    confidence: service ? conf : "low",
    reason:
      str(r.reason, 400) ??
      (service ? "" : "None of your listed services clearly fit this request."),
    alternatives,
    details,
    missing: [...missing].slice(0, 8),
    questions: (Array.isArray(r.questions) ? r.questions : [])
      .map((x) => str(x, 200))
      .filter((x): x is string => !!x)
      .slice(0, 4),
    // Only service + date + time are required to advance to an explicit booking confirmation.
    // Optional caller details remain visible in `missing`, but must not block readiness.
    readyToBook: !!service && !!details.preferredDate && !!details.preferredTime,
  };
}
