# Architecture decisions
- Per-automation key pools (DB2 automation_key_pools) are the only home for provider keys; never hardcode provider keys. Rotation logic lives in src/lib/key-pool.ts and is pure so every automation reuses it.
