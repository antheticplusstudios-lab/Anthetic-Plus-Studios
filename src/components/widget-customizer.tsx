import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_WIDGET_CONFIG,
  normalizeWidgetConfig,
  type WidgetConfig,
} from "@/lib/widget-config";
import { saveClientWidgetConfig } from "@/lib/client-platform.functions";

export function WidgetCustomizer({
  automationId,
  initial,
  onSaved,
}: {
  automationId: string;
  initial: unknown;
  onSaved?: () => void;
}) {
  const [c, setC] = useState<WidgetConfig>(() => normalizeWidgetConfig(initial));
  const [saving, setSaving] = useState(false);
  useEffect(() => setC(normalizeWidgetConfig(initial)), [initial]);

  async function save() {
    setSaving(true);
    try {
      await saveClientWidgetConfig({
        data: { automationId, config: c as unknown as Record<string, unknown> },
      });
      toast.success("Widget saved");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save widget");
    } finally {
      setSaving(false);
    }
  }

  const update = <K extends keyof WidgetConfig>(key: K, value: WidgetConfig[K]) =>
    setC((current) => ({ ...current, [key]: value }));
  const speed = `${2.4 / Math.max(0.2, c.speed)}s`;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="grid gap-3">
        {[
          ["primary", "Primary"],
          ["secondary", "Secondary"],
          ["center", "Center"],
          ["glow", "Glow"],
        ].map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <Label>{label} color</Label>
            <input
              type="color"
              value={c[key as keyof WidgetConfig] as string}
              onChange={(e) => update(key as keyof WidgetConfig, e.target.value as never)}
            />
          </div>
        ))}
        <Label>Orb size ({c.size}px)</Label>
        <input
          type="range"
          min={44}
          max={132}
          step={1}
          value={c.size}
          onChange={(e) => update("size", Number(e.target.value))}
        />
        <Label>Ball count ({c.ballCount})</Label>
        <input
          type="range"
          min={8}
          max={128}
          step={1}
          value={c.ballCount}
          onChange={(e) => update("ballCount", Number(e.target.value))}
        />
        <Label>Animation speed ({c.speed.toFixed(1)}x)</Label>
        <input
          type="range"
          min={0.1}
          max={4}
          step={0.1}
          value={c.speed}
          onChange={(e) => update("speed", Number(e.target.value))}
        />
        <Label>Sphere radius ({c.radius}px)</Label>
        <input
          type="range"
          min={8}
          max={60}
          step={1}
          value={c.radius}
          onChange={(e) => update("radius", Number(e.target.value))}
        />
        <Label>Variation ({Math.round(c.variation * 100)}%)</Label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={c.variation}
          onChange={(e) => update("variation", Number(e.target.value))}
        />
        <Label>Orb position</Label>
        <select
          value={c.position}
          onChange={(e) => update("position", e.target.value as WidgetConfig["position"])}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="bottom-right">Bottom right</option>
          <option value="bottom-left">Bottom left</option>
        </select>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={c.chat.autoOpen ? "default" : "outline"}
            onClick={() => update("chat", { ...c.chat, autoOpen: !c.chat.autoOpen })}
          >
            auto-open {c.chat.autoOpen ? "on" : "off"}
          </Button>
          <Button
            size="sm"
            variant={c.sound ? "default" : "outline"}
            onClick={() => update("sound", !c.sound)}
          >
            sound {c.sound ? "on" : "off"}
          </Button>
          <Button
            size="sm"
            variant={c.shine ? "default" : "outline"}
            onClick={() => update("shine", !c.shine)}
          >
            shine {c.shine ? "on" : "off"}
          </Button>
        </div>
        <Label>Welcome message</Label>
        <Input value={c.welcome} onChange={(e) => update("welcome", e.target.value)} />
        <Label>Input placeholder</Label>
        <Input value={c.placeholder} onChange={(e) => update("placeholder", e.target.value)} />
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save widget"}
        </Button>
      </div>
      <div className="relative min-h-80 overflow-hidden rounded-2xl border border-border bg-muted/40">
        <div
          className={`absolute bottom-4 w-72 rounded-2xl border border-border bg-card p-4 shadow-lg ${c.position === "bottom-left" ? "left-4" : "right-4"}`}
        >
          <div className="grid place-items-center" style={{ height: c.size + 34 }}>
            <div className="relative" style={{ width: c.size, height: c.size }}>
              {Array.from({ length: Math.min(c.ballCount, 48) }).map((_, i) => {
                const angle = (i / Math.max(1, Math.min(c.ballCount, 48))) * Math.PI * 2;
                const r = c.radius * (1 + (i % 2 ? c.variation : -c.variation));
                const x = c.size / 2 + Math.cos(angle) * r;
                const y = c.size / 2 + Math.sin(angle) * r;
                const color = i % 2 ? c.secondary : c.primary;
                return (
                  <span
                    key={i}
                    className="absolute rounded-full"
                    style={{
                      width: c.ballSize,
                      height: c.ballSize,
                      left: x,
                      top: y,
                      transform: "translate(-50%,-50%)",
                      background: `radial-gradient(circle at 30% 25%, white, ${color} 70%, ${c.glow})`,
                      boxShadow: `0 0 ${Math.max(3, c.ballSize * 2)}px ${c.glow}88`,
                      animation: `ap-widget-pulse ${speed} ease-in-out ${i * 0.02}s infinite`,
                    }}
                  />
                );
              })}
              <span
                className="absolute left-1/2 top-1/2 rounded-full"
                style={{
                  width: c.centerSize,
                  height: c.centerSize,
                  transform: "translate(-50%,-50%)",
                  background: `radial-gradient(circle at 32% 28%, white, ${c.center} 55%, ${c.glow})`,
                  boxShadow: `0 0 ${Math.max(10, c.centerSize * 0.8)}px ${c.glow}aa`,
                }}
              />
            </div>
          </div>
          <div className="rounded-xl bg-muted px-3 py-2 text-center text-xs">
            {c.chat.title} · {c.chat.subtitle}
          </div>
          <p className="mt-2 text-sm">{c.welcome}</p>
        </div>
        <style>
          {
            "@keyframes ap-widget-pulse{0%,100%{transform:scale(.96);opacity:.76}50%{transform:scale(1);opacity:1}}"
          }
        </style>
      </div>
    </div>
  );
}

export { DEFAULT_WIDGET_CONFIG };
