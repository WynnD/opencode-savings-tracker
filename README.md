# OpenCode Savings Tracker

Track your local inference savings vs API costs in real-time.

## Installation

### 1. Plugin (automatic token tracking)

Copy the plugin to your opencode plugins directory:

```bash
mkdir -p ~/.config/opencode/plugins
cp opencode-savings-tracker/src/index.ts ~/.config/opencode/plugins/savings-tracker.ts
```

This tracks token usage automatically when you use local inference.

### 2. Commands (manual access)

Copy the command files to your commands directory:

```bash
mkdir -p ~/.config/opencode/commands
cp opencode-savings-tracker/.opencode/commands/*.md ~/.config/opencode/commands/
```

Then use:
- `/savings` - Show savings summary
- `/savings-reset confirm: true` - Reset tracking data

### 3. Config (optional)

Create `~/.local/share/opencode-savings/config.json` to customize defaults:

```json
{
  "providers": ["llama-*", "minimax-*"],
  "baseline": {
    "provider": "minimax",
    "model": "nvfp4",
    "inputCostPer1M": 0.30,
    "outputCostPer1M": 1.20,
    "cacheReadCostPer1M": 0.06
  },
  "gpus": [
    {
      "wattage": 275,
      "promptTokensPerSecond": 1000,
      "outputTokensPerSecond": 43,
      "costPerKwh": 0.12
    }
  ]
}
```

## How It Works

The plugin tracks every request by hooking into `message.updated` events:

1. When an assistant message completes, it reads token counts
2. Calculates **baseline cost**: What you'd pay at API rates
3. Calculates **local cost**: Electricity used (watts × time × $/kWh)
4. Saves to `~/.local/share/opencode-savings/usage.json`

### Cost Calculation

```
baselineCost = (inputTokens × $0.30/M) + (outputTokens × $1.20/M)

promptSeconds = inputTokens / promptTokensPerSecond
outputSeconds = outputTokens / outputTokensPerSecond
localCost = totalWatts × (promptSeconds + outputSeconds) × $0.12/kWh
```

## Example Output

```
Savings Tracker Summary
======================
Period: 7.3 days (since 2024-01-15)

Usage:
  Total requests: 1,234
  Total tokens: 5,678,901
    - Fresh input: 4,123,456
    - Cache read: 555,445
    - Completion: 1,555,445

Costs:
  minimax/nvfp4 API: $234.56
    - Cache read: $0.03
    - Fresh input: $123.70
    - Output: $186.65
  Local inference: $0.01
  -------------------------
  Net savings: $234.55 (99% cheaper at home)
```

## Future Enhancements

See [GitHub Issues](https://github.com/WynnD/opencode-savings-tracker/issues) for planned features:
- Track savings over time with charts
- Show cache hit rate percentage