import { describe, expect, it } from "vitest";
import {
  assertBrowserSafeSupabaseKey,
  resolvePublicDb1Config,
} from "../../scripts/public-supabase-config";

describe("public Supabase build configuration", () => {
  it("maps public server build aliases when VITE variables are not supplied", () => {
    expect(
      resolvePublicDb1Config(
        {
          DB1_URL: "https://auth-project.supabase.co",
          DB1_ANON_KEY: "eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.signature",
          DB1_SERVICE_KEY: "must-not-be-used",
        },
        {},
      ),
    ).toEqual({
      url: "https://auth-project.supabase.co",
      key: "eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.signature",
    });
  });

  it("prefers explicit VITE values over server aliases", () => {
    expect(
      resolvePublicDb1Config(
        {
          VITE_DB1_URL: "https://explicit.supabase.co",
          VITE_DB1_ANON_KEY: "sb_publishable_public-key",
          DB1_URL: "https://other.supabase.co",
          DB1_ANON_KEY: "other-public-key",
        },
        {},
      ),
    ).toEqual({ url: "https://explicit.supabase.co", key: "sb_publishable_public-key" });
  });

  it("uses loaded .env values if process environment values are blank", () => {
    expect(
      resolvePublicDb1Config(
        { VITE_DB1_URL: "", VITE_DB1_ANON_KEY: "" },
        {
          DB1_URL: "https://loaded.supabase.co",
          DB1_ANON_KEY: "sb_publishable_loaded-key",
        },
      ),
    ).toEqual({ url: "https://loaded.supabase.co", key: "sb_publishable_loaded-key" });
  });

  it("rejects modern secret keys before they can be bundled", () => {
    expect(() => assertBrowserSafeSupabaseKey("sb_secret_do-not-bundle")).toThrow(
      /service-role\/secret keys server-side/,
    );
  });

  it("rejects legacy JWTs whose role is service_role", () => {
    const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
    expect(() => assertBrowserSafeSupabaseKey(`header.${payload}.signature`)).toThrow(
      /service_role claim/,
    );
  });

  it("accepts a legacy anon JWT and a publishable key", () => {
    const payload = Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url");
    expect(() => assertBrowserSafeSupabaseKey(`header.${payload}.signature`)).not.toThrow();
    expect(() => assertBrowserSafeSupabaseKey("sb_publishable_public-key")).not.toThrow();
  });

  it("uses the modern DB1 publishable-key alias when the anon alias is absent", () => {
    expect(
      resolvePublicDb1Config(
        {
          DB1_URL: "https://auth-project.supabase.co",
          DB1_PUBLISHABLE_KEY: "sb_publishable_public-key",
        },
        {},
      ),
    ).toEqual({
      url: "https://auth-project.supabase.co",
      key: "sb_publishable_public-key",
    });
  });
});
