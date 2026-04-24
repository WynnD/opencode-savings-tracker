import { type Plugin, tool } from "@opencode-ai/plugin"
import type { Event } from "@opencode-ai/sdk"
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
    cacheReadCostPer1M: 0.06,
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

function matchesProvider(providerId, modelId, patterns) {
  return patterns.some(pattern => {
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1)
      return providerId.startsWith(prefix) || modelId.startsWith(prefix) ||
             providerId.includes(prefix) || modelId.includes(prefix)
    }
    return providerId === pattern || modelId === pattern
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

function calculateBaselineCost(promptTokens, completionTokens, cacheReadTokens, cfg) {
  const cacheReadCost = (cacheReadTokens * (cfg.baseline.cacheReadCostPer1M || 0.06)) / 1_000_000
  const freshInputCost = ((promptTokens - cacheReadTokens) * cfg.baseline.inputCostPer1M) / 1_000_000
  const outputCost = (completionTokens * cfg.baseline.outputCostPer1M) / 1_000_000
  return cacheReadCost + freshInputCost + outputCost
}

export const SavingsTracker: Plugin = async ({ client }) => {
  const configFile = join(DATA_DIR, "config.json")
  const dataFile = join(DATA_DIR, "usage.json")

  let usageData = {
    startDate: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalCacheReadTokens: 0,
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
      totalCacheReadTokens: 0,
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

  await client.app.log({
    service: "savings-tracker",
    level: "info",
    message: "Plugin initialized",
  })

  return {
    event: async ({ event }) => {
      if (event.type !== "message.updated") return
      const msg = (event as any).properties?.info
      if (!msg || msg.role !== "assistant") return
      
      const assistantMsg = msg as { 
        providerID?: string
        modelID?: string
        tokens?: { 
          input: number
          output: number
          cache?: { read?: number; write?: number }
        }
        usage?: {
          prompt_tokens_details?: { cached_tokens?: number }
        }
      }
      if (!assistantMsg?.tokens) return

      const modelId = `${assistantMsg.providerID || ""}/${assistantMsg.modelID || ""}`
      const cfg = loadConfig()

      if (!matchesProvider(assistantMsg.providerID || "", assistantMsg.modelID || "", cfg.providers)) return

      const promptTokens = assistantMsg.tokens.input || 0
      const completionTokens = assistantMsg.tokens.output || 0
      const cacheReadTokens = assistantMsg.usage?.prompt_tokens_details?.cached_tokens || assistantMsg.tokens.cache?.read || 0

      if (!promptTokens && !completionTokens) return

      const baselineCost = calculateBaselineCost(promptTokens, completionTokens, cacheReadTokens, cfg)
      const localCost = calculateLocalCost(promptTokens, completionTokens, cfg)

      usageData.totalPromptTokens += promptTokens
      usageData.totalCompletionTokens += completionTokens
      usageData.totalCacheReadTokens += cacheReadTokens
      usageData.totalRequests += 1
      usageData.baselineCost += baselineCost
      usageData.localCost += localCost

      if (!usageData.byModel[modelId]) {
        usageData.byModel[modelId] = { promptTokens: 0, completionTokens: 0, cacheReadTokens: 0, requests: 0 }
      }
      usageData.byModel[modelId].promptTokens += promptTokens
      usageData.byModel[modelId].completionTokens += completionTokens
      usageData.byModel[modelId].cacheReadTokens += cacheReadTokens
      usageData.byModel[modelId].requests += 1

      saveData()
    },
  }
}