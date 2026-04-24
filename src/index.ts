import type { Plugin } from "@opencode-ai/plugin"
import { resolve } from "path"

interface ModelCost {
  inputCostPer1M: number
  outputCostPer1M: number
}

interface GPUConfig {
  wattage: number
  tokensPerSecond: number
  costPerKwh?: number
  purchasePrice?: number
  lifespanYears?: number
}

interface SavingsConfig {
  providers: string[]
  baseline: {
    provider: string
    model: string
    inputCostPer1M: number
    outputCostPer1M: number
  }
  models: Record<string, ModelCost>
  gpus: GPUConfig[]
}

interface UsageRecord {
  timestamp: number
  model: string
  provider: string
  promptTokens: number
  completionTokens: number
  duration: number
}

interface SavingsData {
  startDate: string
  lastUpdated: string
  totalPromptTokens: number
  totalCompletionTokens: number
  totalRequests: number
  baselineCost: number
  localCost: number
  savings: number
  byModel: Record<string, {
    promptTokens: number
    completionTokens: number
    requests: number
  }>
}

const CONFIG_DEFAULTS: SavingsConfig = {
  providers: ["llama-*"],
  baseline: {
    provider: "openai",
    model: "gpt-4o",
    inputCostPer1M: 15,
    outputCostPer1M: 60,
  },
  models: {},
  gpus: [],
}

export const SavingsTracker: Plugin = async ({ client, $ }) => {
  const configDir = process.env.XDG_CONFIG_HOME || `${process.env.HOME}/.config/opencode`
  const dataFile = resolve(configDir, "savings-tracker", "usage.json")

  let usageData: SavingsData = {
    startDate: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalRequests: 0,
    baselineCost: 0,
    localCost: 0,
    savings: 0,
    byModel: {},
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

  function calculateLocalCost(promptTokens: number, completionTokens: number): number {
    const config = loadConfig()
    if (!config.gpus.length) return 0

    const totalWatts = config.gpus.reduce((sum, gpu) => sum + gpu.wattage, 0)
    const tokensPerSecond = config.gpus.reduce((sum, gpu) => sum + gpu.tokensPerSecond, 0)
    const costPerKwh = config.gpus[0]?.costPerKwh || 0.12

    const totalTokens = promptTokens + completionTokens
    const seconds = totalTokens / tokensPerSecond
    const watthours = (totalWatts * seconds) / 3600
    return (watthours * costPerKwh) / 1000
  }

  function loadConfig(): SavingsConfig {
    return CONFIG_DEFAULTS
  }

  return {
    tool: {
      savings: {
        description: "Show savings tracker summary",
        args: {},
        async execute(_args, context) {
          await loadData()
          const elapsed = Date.now() - new Date(usageData.startDate).getTime()
          const hours = elapsed / (1000 * 60 * 60)
          const days = hours / 24

          const config = loadConfig()
          const baselineName = `${config.baseline.provider}/${config.baseline.model}`
          const totalTokens = usageData.totalPromptTokens + usageData.totalCompletionTokens

          return `Savings Tracker Summary
========================
Period: ${days.toFixed(1)} days (since ${usageData.startDate.split("T")[0]})

Usage:
  Total requests: ${usageData.totalRequests.toLocaleString()}
  Total tokens: ${totalTokens.toLocaleString()}
    - Prompt: ${usageData.totalPromptTokens.toLocaleString()}
    - Completion: ${usageData.totalCompletionTokens.toLocaleString()}

Costs:
  Baseline (${baselineName}): $${usageData.baselineCost.toFixed(4)}
  Local inference: $${usageData.localCost.toFixed(6)}
  -------------------
  Net savings: $${(usageData.baselineCost - usageData.localCost).toFixed(4)}
  (That's ${((usageData.baselineCost - usageData.localCost) / (hours || 1)).toFixed(4)}/hr)`
        },
      },

      "savings-reset": {
        description: "Reset savings data",
        args: {
          confirm: { type: "boolean", description: "Confirm reset", default: false },
        },
        async execute(args, _context) {
          if (!args.confirm) {
            return "Pass confirm: true to reset"
          }

          usageData = {
            startDate: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            totalPromptTokens: 0,
            totalCompletionTokens: 0,
            totalRequests: 0,
            baselineCost: 0,
            localCost: 0,
            savings: 0,
            byModel: {},
          }

          await saveData()
          return "Savings data reset"
        },
      },

      "savings-set-config": {
        description: "Update savings tracker config",
        args: {
          gpu: { type: "string", description: "GPU wattage or 'wattage:tps' format" },
          baseline: { type: "string", description: "Baseline model in provider/model:input:output format" },
          providers: { type: "string", description: "Comma-separated provider patterns" },
        },
        async execute(args, _context) {
          let output = "Config updated. Note: Full config editing requires manual edit of opencode.json"
          return output
        },
      },
    },

    async "session.created"({ session }) {
      await loadData()
    },

    async "message.updated"({ message }) {
      const modelId = message.model?.id || ""
      const config = loadConfig()

      if (!matchesProvider(modelId, config.providers)) return

      const promptTokens = message.usage?.prompt_tokens || 0
      const completionTokens = message.usage?.completion_tokens || 0

      if (!promptTokens && !completionTokens) return

      const baselineCost = (promptTokens * config.baseline.inputCostPer1M / 1_000_000) +
                      (completionTokens * config.baseline.outputCostPer1M / 1_000_000)

      const localCost = calculateLocalCost(promptTokens, completionTokens)

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