# AntheticPlus voice assistant UI upgrade

Replace the two files in the same paths in the project:

- `src/components/assistant/voice-orb.tsx`
- `src/components/assistant/assistant-console.tsx`

The existing assistant/session/voice-loop/server logic is preserved. The new UI adds:
- a full orb instead of the incomplete ring;
- AntheticPlus purple/cyan glass styling;
- separate idle/listening/thinking/speaking/error motion;
- live interim speech text;
- latest conversation preview while the voice interaction is active;
- a stable bounded header so expansion does not push the page layout around;
- mobile sizing and reduced-motion support.

No database or environment-variable changes are required.
