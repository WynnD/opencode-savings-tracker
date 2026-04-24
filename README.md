# OpenCode Savings Tracker

Track your local inference savings vs API costs.

## Configuration

Add to your `opencode.json`:

```json
{
  "plugins": ["opencode-savings-tracker"],
  "savings": {
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
}
```

### Config Options

| Field | Description |
|-------|-------------|
| `providers` | Provider patterns to track (globs like `llama-*` work) |
| `baseline.provider` | API provider name for comparison |
| `baseline.model` | API model name |
| `baseline.inputCostPer1M` | Input cost per 1M tokens |
| `baseline.outputCostPer1M` | Output cost per 1M tokens |
| `gpus[].wattage` | GPU wattage (use average during inference) |
| `gpus[].promptTokensPerSecond` | Prompt processing speed |
| `gpus[].outputTokensPerSecond` | Generation speed |
| `gpus[].costPerKwh` | Electricity rate (default: $0.12) |

## Usage

Commands:
- `/savings` - Show savings summary
- `/savings-reset` - Reset tracking data (pass `confirm: true`)

## How It Works

The plugin tracks token usage from local providers (matching your provider patterns) and calculates:
- **Baseline cost**: What you'd pay on the API model (input + output tokens × rate)
- **Local cost**: Electricity used (watts × time × $/kWh)
- **Savings**: Baseline - Local

## Example Output

```
Savings Tracker Summary
========================
Period: 7.3 days (since 2024-01-15)

Usage:
  Total requests: 1,234
  Total tokens: 5,678,901
    - Prompt: 4,123,456
    - Completion: 1,555,445

Costs:
  Baseline (minimax/nvfp4 @ $0.30/ $1.20): $234.56
  Local inference: $0.01
  -------------------
  Net savings: $234.55
  (That's $32.14/hr)
```