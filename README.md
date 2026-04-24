# OpenCode Savings Tracker

Track your local inference savings vs API costs in real-time. See how much you're saving by running models locally instead of paying API rates.

**97% cheaper at home!** Local inference costs ~$0.01 vs $0.30/M tokens on the API.

## Features

- **Automatic tracking** - Plugin tracks every request silently
- **Cache-aware** - Tracks prefix caching (fresh vs cached tokens)
- **Simple commands** - `/savings` to see your savings
- **Easy install** - Copy files, restart, done

## Installation

### 1. Install the plugin

```bash
mkdir -p ~/.config/opencode/plugins
cp src/index.ts ~/.config/opencode/plugins/savings-tracker.ts
```

### 2. Install the commands

```bash
mkdir -p ~/.config/opencode/commands
cp .opencode/commands/*.md ~/.config/opencode/commands/
```

### 3. Restart opencode

```bash
# Exit and reopen opencode, or restart the daemon
```

### 4. Test it

```bash
opencode run "hello"          # Generate some tokens
opencode run "/savings"      # See your savings!
```

## Commands

| Command | Description |
|---------|------------|
| `/savings` | Show savings summary |
| `/savings-reset confirm: true` | Reset all tracking data |

## What It Tracks

| Token Type | Rate | Notes |
|----------|------|-------|
| Fresh input | $0.30/M | New tokens processed |
| Cache read | $0.06/M | From prefix caching |
| Output | $1.20/M | Generated tokens |

**Your local cost**: Just electricity (~$0.0001/M tokens at $0.12/kWh)

## Example Output

```
Savings Tracker Summary
======================
Period: 0.5 days (since 2024-04-24)

Usage:
  Total requests: 25
  Total input tokens: 3,456,789
    - Fresh: 2,123,456
    - Cache read: 1,333,333
  Total output tokens: 45,678

Costs:
  minimax/nvfp4 API: $12.34
    - Cache read: $0.08
    - Fresh input: $0.64
    - Output: $0.55
  Local inference: $0.01
  -------------------------
  Net savings: $12.33 (99% cheaper at home)
```

## Configuration

Create `~/.local/share/opencode-savings/config.json` to customize:

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

### Config Options

| Option | Default | Description |
|--------|---------|------------|
| `providers` | `["llama-*", "minimax-*"]` | Provider patterns to track |
| `inputCostPer1M` | `$0.30` | Input token rate |
| `outputCostPer1M` | `$1.20` | Output token rate |
| `cacheReadCostPer1M` | `$0.06` | Cache read rate |
| `wattage` | `275` | GPU wattage |
| `promptTokensPerSecond` | `1000` | Input speed |
| `outputTokensPerSecond` | `43` | Generation speed |
| `costPerKwh` | `$0.12` | Electricity rate |

## Requirements

- **OpenCode** with `@opencode-ai/plugin` and `@opencode-ai/sdk`
- **vLLM** with prefix caching enabled:
  ```
  --enable-prefix-caching
  --enable-prompt-tokens-details
  ```
- Or **llama.cpp** server (KV cache enabled by default)

## Troubleshooting

**No cache tokens showing?**
- Make sure vLLM has `--enable-prompt-tokens-details` flag
- Restart the vLLM server after adding flags

**Plugin not loading?**
- Check for syntax errors: `opencode run "hello" 2>&1 | head -20`
- Verify plugin path exists: `ls ~/.config/opencode/plugins/`

**Reset tracking data:**
```bash
opencode run "/savings-reset confirm: true"
```

## Future Enhancements

See [GitHub Issues](https://github.com/WynnD/opencode-savings-tracker/issues) for:
- Track savings over time with charts
- Show cache hit rate percentage