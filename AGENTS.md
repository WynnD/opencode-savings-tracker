# opencode-savings-tracker

Track local inference savings vs API costs in real-time for OpenCode.

## What It Does

- **Plugin** (`src/index.ts`): Hooks into OpenCode `message.updated` events to automatically track token usage
- **Commands** (`.opencode/commands/`): `/savings` and `/savings-reset` for manual access
- **Data** (`~/.local/share/opencode-savings/`): Stores usage.json with token counts and costs

## Token Tracking

| Token Type | Cost Rate | Source |
|----------|---------|--------|
| Fresh input | $0.30/M | `tokens.input` |
| Cache read | $0.06/M | `usage.prompt_tokens_details.cached_tokens` |
| Output | $1.20/M | `tokens.output` |

## Local Cost Calculation

```
localCost = totalWatts × (promptTokens / promptTPS + outputTokens / outputTPS) × $0.12/kWh
```

## Key Files

| File | Purpose |
|------|--------|
| `src/index.ts` | Plugin - token tracking hook |
| `.opencode/commands/savings.md` | `/savings` command prompt |
| `.opencode/commands/savings-reset.md` | `/savings-reset` command prompt |
| `README.md` | Installation and usage docs |

## Feature Status

- [x] Track fresh input tokens
- [x] Track cache read tokens
- [x] Track output tokens
- [x] Calculate API vs local costs
- [x] Cache hit tracking
- [ ] Savings over time / charts (see issue #1)
- [ ] Cache hit rate display (see issue #2)

## Testing

```bash
opencode run "/savings"           # Check current savings
opencode run "/savings-reset confirm:true"  # Reset tracking
opencode run "hello"           # Generate test inference
```

## Dependencies

- OpenCode with `@opencode-ai/plugin` and `@opencode-ai/sdk`
- vLLM with `--enable-prefix-caching --enable-prompt-tokens-details`
- llama-swap server infrastructure