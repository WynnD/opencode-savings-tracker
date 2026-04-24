# OpenCode Savings Tracker

Track your local inference savings vs API costs.

## Configuration

Add to your `opencode.json`:

```json
{
  "plugins": ["opencode-savings-tracker"],
  "savings": {
    "providers": ["llama-*", "ollama-*"],
    "baseline": {
      "provider": "openai",
      "model": "gpt-4o",
      "inputCostPer1M": 15,
      "outputCostPer1M": 60
    },
    "gpus": [
      {
        "wattage": 290,
        "tokensPerSecond": 43,
        "costPerKwh": 0.12
      }
    ]
  }
}
```

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
  Baseline (openai/gpt-4o): $234.56
  Local inference: $0.01
  -------------------
  Net savings: $234.55
  (That's $32.14/hr)
```