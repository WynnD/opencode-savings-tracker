---
description: Show savings tracker summary comparing local inference costs vs API costs
---

Read the usage data and display a formatted savings summary.

Calculate:
- Total API cost at minimax rates ($0.30/M input, $1.20/M output tokens)
- Total local cost (electricity used based on GPU wattage and throughput)
- Net savings and percentage

Show the output in this format:
```
Savings Tracker Summary
======================
Period: X days

Usage:
  Total requests: N
  Total tokens: N
    - Prompt: N
    - Completion: N

Costs:
  minimax/nvfp4 API: $X.XXXX
  Local inference: $X.XXXX
  -------------------------
  Net savings: $X.XXXX (XX% cheaper at home)
```

If no usage data exists, say "No usage data yet. Start using local inference to track savings!"