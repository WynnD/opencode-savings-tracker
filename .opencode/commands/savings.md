---
description: Show savings tracker summary comparing local inference costs vs API costs
---

Read the usage data and display a formatted savings summary.

Pricing:
- Input tokens: $0.30/M
- Output tokens: $1.20/M
- Cache Read tokens: $0.06/M

Calculate:
- Fresh input tokens = total input - cache_read tokens
- Baseline API cost breakdown:
  - Cache read cost = cache_read_tokens × $0.06/M
  - Fresh input cost = fresh_input_tokens × $0.30/M
  - Output cost = output_tokens × $1.20/M
- Total baseline = sum of above
- Total local cost (electricity based on GPU wattage)
- Net savings and percentage

Show the output in this format:
```
Savings Tracker Summary
======================
Period: X days

Usage:
  Total requests: N
  Total input tokens: N
    - Fresh: N
    - Cache Read: N
  Total output tokens: N

Costs:
  minimax/nvfp4 API: $X.XXXX
    - Cache read: $X.XXXX
    - Fresh input: $X.XXXX
    - Output: $X.XXXX
  Local inference: $X.XXXX
  -------------------------
  Net savings: $X.XXXX (XX% cheaper at home)
```

If no usage data exists, say "No usage data yet. Start using local inference to track savings!"