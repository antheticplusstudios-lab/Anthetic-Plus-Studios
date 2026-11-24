# Redesign audit corrections (2026-11-24)

- Color system: all green/teal hues replaced with royal / electric / icy blue, deep navy and restrained cyan
  (light, dark/midnight, admin workspace, charts, sidebar, rings, shadows, atmospheres).
- AI Orb: facial features removed. New crystal-glass sphere (`ai-orb.tsx` + lazy `ai-orb-scene.tsx`, R3F)
  with illuminated Autumic symbol, luminous core, orbital rings, particles, Lightformer reflections.
  Same props/API: state + live `levelRef` from the real voice loop drive core pulse, ring speed and tint.
  CSS glass fallback for SSR, reduced motion and no-WebGL. Rendering pauses off-screen.
- Homepage hero: centered composition, orb as centerpiece, voice dock (mic, input, send) under the orb;
  transcript appears only once a conversation starts. Large side chat panel removed.
- CTA: gradient royal-to-electric hero button. Ambient 3D shapes on inner pages toned down.
- Embeddable widget fallback colors moved to blue.

## V4 engineering audit (follow-up)

- Fixed: signed-out visits to /dashboard/* and /admin/* threw React errors #520/#422
  ("reading routeId") during the redirect to sign-in. The guard now redirects once from the
  layout after hydration, keeping the original `redirect` target.
- Fixed: the Orb's WebGL capability probe left a live WebGL context behind on every mount;
  it is now released immediately.
- Added: the Orb's 3D scene also pauses while the browser tab is hidden (in addition to
  off-screen pausing).
- Verified: public pages at 360/390/768/1024/1440/1920 px show no horizontal overflow and no
  page errors; Orb fallback under reduced motion and without WebGL; keyboard order and mobile
  menu focus return.
- Not verified (needs backend keys / signed-in account): dashboard and admin page layouts,
  live voice, payments, tenant isolation.
