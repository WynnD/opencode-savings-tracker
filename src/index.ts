import type { Plugin } from "@opencode-ai/plugin"
import { resolve, join } from "path"

interface GPUConfig {
  wattage: number
  promptTokensPerSecond: number
  outputTokensPerSecond: number
  costPerKwh?: number
}

interface BaselineConfig {
  provider: string
  model: string
  inputCostPer1M: number
  outputCostPer1M: number
}

interface SavingsConfig {
  providers: string[]
  baseline: BaselineConfig
  gpus: GPUConfig[]
}

interface SavingsData {
  startDate: string
  lastUpdated: string
  totalPromptTokens: number
  totalCompletionTokens: number
  totalRequests: number
  baselineCost: number
  localCost: number
  byModel: Record<string, {
    promptTokens: number
    completionTokens: number
    requests: number
  }>
}

const DEFAULT_CONFIG: SavingsConfig = {
  providers: ["llama-*"],
  baseline: {
    provider: "openai",
    model: "gpt-4o",
    inputCostPer1M: 15,
    outputCostPer1M: 60,
  },
  gpus: [],
}

export const SavingsTracker: Plugin = async ({ client, $ }) => {
  const configDir = process.env.XDG_CONFIG_HOME || join(process.env.HOME!, ".config", "opencode")
  const dataFile = join(configDir, "savings-tracker", "usage.json")

  let usageData: SavingsData = {
    startDate: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalRequests: 0,
    baselineCost: 0,
    localCost: 0,
    byModel: {},
  }

  let config = DEFAULT_CONFIG

  async function loadConfig(): Promise<SavingsConfig> {
    if (config.gpus.length) return config

    try {
      const cfg = await client.config.get()
      const savings = (cfg.data as any)?.savings
      if (savings) {
        config = {
          providers: savings.providers || DEFAULT_CONFIG.providers,
          baseline: savings.baseline || DEFAULT_CONFIG.baseline,
          gpus: (savings.gpus || []).map((g: any) => ({
            wattage: g.wattage || 275,
            promptTokensPerSecond: g.promptTokensPerSecond || g.tokensPerSecond || 1000,
            outputTokensPerSecond: g.outputTokensPerSecond || g.tokensPerSecond || 43,
            costPerKwh: g.costPerKwh || 0.12,
          })),
        }
      }
    } catch {
      // Use defaults
    }

    return config
  }

  async function loadData() {
    try {
      const content = await Bun.file(dataFile).text()
      usageData = JSON.parse(content)
    } catch {
      // File doesn't exist yet, use defaults
    }
  }

  async function saveData() {
    usageData.lastUpdated = new Date().toISOString()
    const dir = join(configDir, "savings-tracker")
    await $`mkdir -p ${dir}`
    await Bun.write(dataFile, JSON.stringify(usageData, null, 2))
  }

  function matchesProvider(modelId: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      if (pattern.endsWith("*")) {
        const prefix = pattern.slice(0, -1)
        return modelId.startsWith(prefix) || modelId.includes(prefix)
      }
      return modelId === pattern
    })
  }

  function calculateLocalCost(promptTokens: number, completionTokens: number, cfg: SavingsConfig): number {
    if (!cfg.gpus.length) return 0

    const totalWatts = cfg.gpus.reduce((sum, gpu) => sum + gpu.wattage, 0)
    const promptTps = cfg.gpus.reduce((sum, gpu) => sum + gpu.promptTokensPerSecond, 0)
    const outputTps = cfg.gpus.reduce((sum, gpu) => sum + gpu.outputTokensPerSecond, 0)
    const costPerKwh = cfg.gpus[0]?.costPerKwh || 0.12

    const promptSeconds = promptTokens / promptTps
    const outputSeconds = completionTokens / outputTps
    const totalSeconds = promptSeconds + outputSeconds
    const watthours = (totalWatts * totalSeconds) / 3600
    return (watthours * costPerKwh) / 1000
  }

  return {
    tool: {
      savings: {
        description: "Show savings tracker summary",
        args: {},
        async execute(_args, _context) {
          await loadData()
          const cfg = await loadConfig()
          const elapsed = Date.now() - new Date(usageData.startDate).getTime()
          const hours = elapsed / (1000 * 60 * 60)
          const days = hours / 24

          const baselineName = `${cfg.baseline.provider}/${cfg.baseline.model}`
          const savings = usageData.baselineCost - usageData.localCost
          const savingsPerMTok = savings / ((usageData.totalPromptTokens + usageData.totalCompletionTokens) / 1_000_000)
          const localPerMTok = usageData.localCost / ((usageData.totalPromptTokens + usageData.totalCompletionTokens) / 1_000_000) || 0
          const baselinePerMTok = cfg.baseline.inputCostPer1M + cfg.baseline.outputCostPer1M

          return `Savings Tracker Summary
========================
Period: ${days.toFixed(1)} days (since ${usageData.startDate.split("T")[0]})

Usage:
  Total requests: ${usageData.totalRequests.toLocaleString()}
  Total tokens: ${(usageData.totalPromptTokens + usageData.totalCompletionTokens).toLocaleString()}
    - Prompt: ${usageData.totalPromptTokens.toLocaleString()}
    - Completion: ${usageData.totalCompletionTokens.toLocaleString()}

Costs:
  ${baselineName} API: $${usageData.baselineCost.toFixed(4)} ($${baselinePerMTok.toFixed(2)}/M tok)
  Local inference: $${usageData.localCost.toFixed(4)} ($${localPerMTok.toFixed(2)}/M tok)
  -------------------------
  Net savings: $${savings.toFixed(4)} ($${savingsPerMTok.toFixed(2)}/M tok)
  Rate: ${((savings / (usageData.baselineCost || 1)) * 100).toFixed(0)}% cheaper at home`
        },
      },

      "savings-reset": {
        description: "Reset savings tracker data",
        args: {
          confirm: { type: "boolean", description: "Set to true to confirm reset", default: false },
        },
        async execute(args, _context) {
          if (!args.confirm) {
            return "Pass confirm: true to reset tracking data"
          }

          usageData = {
            startDate: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            totalPromptTokens: 0,
            totalCompletionTokens: 0,
            totalRequests: 0,
            baselineCost: 0,
            localCost: 0,
            byModel: {},
          }

          await saveData()
          return "Savings data reset. Start fresh!"
        },
      },
    },

    async "session.created"() {
      await loadData()
    },

    async "message.updated"({ message }) {
      const modelId = message.model?.id || ""
      const cfg = await loadConfig()

      if (!matchesProvider(modelId, cfg.providers)) return

      const promptTokens = message.usage?.prompt_tokens || 0
      const completionTokens = message.usage?.completion_tokens || 0

      if (!promptTokens && !completionTokens) return

      const baselineCost = (promptTokens * cfg.baseline.inputCostPer1M / 1_000_000) +
                        (completionTokens * cfg.baseline.outputCostPer1M / 1_000_000)

      const localCost = calculateLocalCost(promptTokens, completionTokens, cfg)

      usageData.totalPromptTokens += promptTokens
      usageData.totalCompletionTokens += completionTokens
      usageData.totalRequests += 1
      usageData.baselineCost += baselineCost
      usageData.localCost += localCost

      if (!usageData.byModel[modelId]) {
        usageData.byModel[modelId] = { promptTokens: 0, completionTokens: 0, requests: 0 }
      }
      usageData.byModel[modelId].promptTokens += promptTokens
      usageData.byModel[modelId].completionTokens += completionTokens
      usageData.byModel[modelId].requests += 1

      await saveData()
    },
  }
}