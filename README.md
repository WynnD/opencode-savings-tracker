# OpenCode Savings Tracker

Track your local inference savings vs API costs in real-time.

## Installation

1. **Plugin** (tracks token usage):
   ```json
   {
     "plugin": ["/home/you/.config/opencode/plugins/savings-tracker.ts"]
   }
   ```

2. **Custom tools** (for commands):
   - Copy `tools/savings.ts` to `~/.config/opencode/tools/savings.ts`
   - Copy `tools/savings-reset.ts` to `~/.config/opencode/tools/savings-reset.ts`

3. **Config** (optional - uses defaults if missing):
   ```json
   {
     "providers": ["llama-*", "minimax-*"],
     "baseline": {
       "provider": "minimax",
       "model": "nvfp4",
       "inputCostPer1M": 0.30,
       "outputCostPer1M": 1.20
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
   Save to `~/.local/share/opencode-savings/config.json`

## Config Options

| Field | Description | Default |
|-------|------------|--------|
| `providers` | Provider patterns to track (globs like `llama-*`) | `["llama-*", "minimax-*"]` |
| `baseline.provider` | API provider for comparison | `minimax` |
| `baseline.model` | API model name | `nvfp4` |
| `baseline.inputCostPer1M` | Input cost per 1M tokens | `$0.30` |
| `baseline.outputCostPer1M` | Output cost per 1M tokens | `$1.20` |
| `gpus[].wattage` | GPU wattage (average during inference) | `275W` |
| `gpus[].promptTokensPerSecond` | Prompt processing speed | `1000 tok/s` |
| `gpus[].outputTokensPerSecond` | Generation speed | `43 tok/s` |
| `gpus[].costPerKwh` | Electricity rate | `$0.12` |

## Usage

- `/savings` - Show savings summary
- `/savings-reset confirm=true` - Reset tracking data

## How It Works

The plugin hooks into `event:message.updated` to track token usage from local inference, then calculates:
- **Baseline cost**: What you'd pay on the API (input + output tokens × rate)
- **Local cost**: Electricity used (watts × time × $/kWh)
- **Savings**: Baseline - Local

## Example Output

```
Savings Tracker Summary
=======================
Period: 7.3 days (since 2024-01-15)

Usage:
  Total requests: 1,234
  Total tokens: 5,678,901
    - Prompt: 4,123,456
    - Completion: 1,555,445

Costs:
  minimax/nvfp4 API: $234.56
  Local inference: $0.01
  -------------------------
  Net savings: $234.55
  Rate: 99% cheaper at home
```