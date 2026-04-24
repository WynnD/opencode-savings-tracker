---
description: Reset the savings tracker data
---

Reset the usage tracking data file at ~/.local/share/opencode-savings/usage.json

The user MUST confirm with "confirm: true" argument before resetting. If not confirmed, respond:
"Please confirm with `/savings-reset confirm: true` to reset."

On reset:
1. Create a fresh usage.json with startDate: current time, all counters at 0
2. Confirm with "Savings tracker data has been reset."