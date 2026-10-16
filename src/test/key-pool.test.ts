import { describe, expect, it } from "vitest";
import { classifyStatus, orderPool, runWithPool, type PoolKeyState } from "@/lib/key-pool";
import { AUTOMATION_SUITE, RECEPTIONIST_SERVICES, readyServices } from "@/lib/automation-suite";
import { markdownToEmailHtml } from "@/lib/markdown-email";

const key = (id: string, extra: Partial<PoolKeyState> = {}): PoolKeyState => ({
  id,
  label: id,
  enabled: true,
  cooldownUntil: 0,
  uses: 0,
  failures: 0,
  ...extra,
});

describe("key pool", () => {
  it("classifies limits and auth errors", () => {
    expect(classifyStatus(429)).toBe("limit");
    expect(classifyStatus(401)).toBe("auth");
    expect(classifyStatus(503)).toBe("transient");
    expect(classifyStatus(200)).toBe("ok");
  });

  it("orders healthy least-used first and skips disabled", () => {
    const o = orderPool(
      [
        key("a", { uses: 5 }),
        key("b", { uses: 1 }),
        key("c", { enabled: false }),
        key("d", { cooldownUntil: 999 }),
      ],
      10,
    );
    expect(o.map((k) => k.id)).toEqual(["b", "a", "d"]);
  });

  it("switches instantly on a limit and keeps the same conversation", async () => {
    const convo = [{ role: "user", content: "hi" }];
    const seen: unknown[] = [];
    const res = await runWithPool(
      [key("a"), key("b", { uses: 1 })],
      convo,
      async (id, p) => {
        seen.push(p);
        return id === "a" ? { ok: false, kind: "limit" } : { ok: true, value: "hello" };
      },
      () => 1000,
    );
    expect(res.value).toBe("hello");
    expect(res.usedKeyId).toBe("b");
    expect(seen.every((p) => p === convo)).toBe(true);
    expect(res.keys.find((k) => k.id === "a")!.cooldownUntil).toBeGreaterThan(1000);
  });

  it("stops on a fatal error and reports when all keys are exhausted", async () => {
    const fatal = await runWithPool([key("a"), key("b")], null, async () => ({
      ok: false,
      kind: "fatal",
    }));
    expect(fatal.attempts).toHaveLength(1);
    const all = await runWithPool([key("a"), key("b")], null, async () => ({
      ok: false,
      kind: "limit",
    }));
    expect(all.error).toMatch(/limit/);
  });
});

describe("automation suite", () => {
  it("has 4 automations and 10 receptionist services", () => {
    expect(AUTOMATION_SUITE).toHaveLength(4);
    expect(RECEPTIONIST_SERVICES).toHaveLength(10);
    const rec = AUTOMATION_SUITE[0]!;
    expect(rec.pools.find((p) => p.provider === "inworld")!.maxKeys).toBe(10);
  });
  it("flags services needing a phone line", () => {
    const s = readyServices(AUTOMATION_SUITE[0]!, new Set());
    expect(s.find((x) => x.id === "call_handling")!.missing).toEqual(["twilio"]);
    expect(s.find((x) => x.id === "support")!.ready).toBe(true);
  });
});

describe("markdown email", () => {
  it("renders images, links and escapes html", () => {
    const html = markdownToEmailHtml(
      "# Hi\n**Bold** <script>\n\n![x](https://a.com/i.png)\n- [site](https://a.com)\n- [bad](javascript:alert(1))",
    );
    expect(html).toContain("<h1>Hi</h1>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('<img src="https://a.com/i.png"');
    expect(html).toContain('<a href="https://a.com">site</a>');
    expect(html).not.toContain("javascript:");
  });
});
