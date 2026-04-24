import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"

const DATA_DIR = join(process.env.HOME || "", ".local", "share", "opencode-savings")

const DEFAULT_CONFIG = {
  providers: ["llama-*", "minimax-*"],
  baseline: {
    provider: "minimax",
    model: "nvfp4",
    inputCostPer1M: 0.30,
    outputCostPer1M: 1.20,
  },
  gpus: [
    {
      wattage: 275,
      promptTokensPerSecond: 1000,
      outputTokensPerSecond: 43,
      costPerKwh: 0.12,
    },
  ],
}

function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

function loadJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return fallback
  }
}

function saveJson(path, data) {
  ensureDir(dirname(path))
  writeFileSync(path, JSON.stringify(data, null, 2))
}

function matchesProvider(modelId, patterns) {
  return patterns.some(pattern => {
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1)
      return modelId.startsWith(prefix) || modelId.includes(prefix)
    }
    return modelId === pattern
  })
}

function calculateLocalCost(promptTokens, completionTokens, cfg) {
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

export default async () => {
  const configFile = join(DATA_DIR, "config.json")
  const dataFile = join(DATA_DIR, "usage.json")

  let usageData = {
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

  function loadConfig() {
    const userConfig = loadJson(configFile, null)
    if (userConfig) {
      config = {
        providers: userConfig.providers || DEFAULT_CONFIG.providers,
        baseline: userConfig.baseline || DEFAULT_CONFIG.baseline,
        gpus: (userConfig.gpus || DEFAULT_CONFIG.gpus).map(g => ({
          wattage: g.wattage || 275,
          promptTokensPerSecond: g.promptTokensPerSecond || 1000,
          outputTokensPerSecond: g.outputTokensPerSecond || 43,
          costPerKwh: g.costPerKwh || 0.12,
        })),
      }
    }
    return config
  }

  function loadData() {
    usageData = loadJson(dataFile, null) || {
      startDate: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalRequests: 0,
      baselineCost: 0,
      localCost: 0,
      byModel: {},
    }
  }

  function saveData() {
    usageData.lastUpdated = new Date().toISOString()
    saveJson(dataFile, usageData)
  }

  return {
    tool: {
      savings: {
        description: "Show savings tracker summary",
        args: {},
        execute() {
          loadData()
          const cfg = loadConfig()
          const elapsed = Date.now() - new Date(usageData.startDate).getTime()
          const days = elapsed / (1000 * 60 * 60 * 24)
          const baselineName = `${cfg.baseline.provider}/${cfg.baseline.model}`
          const savings = usageData.baselineCost - usageData.localCost
          const totalTokens = usageData.totalPromptTokens + usageData.totalCompletionTokens
          const savingsPerMTok = savings / (totalTokens / 1_000_000) || 0
          const localPerMTok = usageData.localCost / (totalTokens / 1_000_000) || 0
          const baselinePerMTok = cfg.baseline.inputCostPer1M + cfg.baseline.outputCostPer1M

          return `Savings Tracker Summary
=======================
Period: ${days.toFixed(1)} days (since ${usageData.startDate.split("T")[0]})

Usage:
  Total requests: ${usageData.totalRequests.toLocaleString()}
  Total tokens: ${totalTokens.toLocaleString()}
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
        execute(args) {
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
          saveData()
          return "Savings data reset. Start fresh!"
        },
      },
    },

    "message.updated"({ message }) {
      const modelId = message.model?.id || ""
      const cfg = loadConfig()

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

      saveData()
    },
  }
}