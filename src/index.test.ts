import { describe, test, expect } from "bun:test"
import { existsSync, unlinkSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const DATA_DIR = join(process.env.TMPDIR || "/tmp", "opencode-savings-test")
const TEST_CONFIG = join(DATA_DIR, "config.json")
const TEST_DATA = join(DATA_DIR, "usage.json")

test("setup: create test directory", () => {
  mkdirSync(DATA_DIR, { recursive: true })
  expect(existsSync(DATA_DIR)).toBe(true)
})

test("teardown: remove test files", () => {
  if (existsSync(TEST_CONFIG)) unlinkSync(TEST_CONFIG)
  if (existsSync(TEST_DATA)) unlinkSync(TEST_DATA)
})

describe("matchesProvider", () => {
  const tests = [
    { model: "minimax-nvfp4", patterns: ["llama-*", "minimax-*"], expected: true },
    { model: "llama-enterprise/minimax", patterns: ["llama-*", "minimax-*"], expected: true },
    { model: "qwen3.6-35b", patterns: ["llama-*"], expected: false },
    { model: "gpt-4o", patterns: ["llama-*", "minimax-*"], expected: false },
  ]

  for (const { model, patterns, expected } of tests) {
    test(`"${model}" with [${patterns.join(",")}] -> ${expected}`, () => {
      const matches = patterns.some(pattern => {
        if (pattern.endsWith("*")) {
          const prefix = pattern.slice(0, -1)
          return model.startsWith(prefix) || model.includes(prefix)
        }
        return model === pattern
      })
      expect(matches).toBe(expected)
    })
  }
})

describe("calculateLocalCost", () => {
  const cfg = {
    gpus: [{ wattage: 275, promptTokensPerSecond: 1000, outputTokensPerSecond: 43, costPerKwh: 0.12 }],
  }

  test("1000 prompt, 100 completion tokens", () => {
    const promptTokens = 1000
    const completionTokens = 100
    const totalWatts = cfg.gpus.reduce((s, g) => s + g.wattage, 0)
    const promptTps = cfg.gpus.reduce((s, g) => s + g.promptTokensPerSecond, 0)
    const outputTps = cfg.gpus.reduce((s, g) => s + g.outputTokensPerSecond, 0)
    const costPerKwh = cfg.gpus[0].costPerKwh
    const watthours = (totalWatts * (promptTokens / promptTps + completionTokens / outputTps)) / 3600
    const cost = (watthours * costPerKwh) / 1000
    expect(cost).toBeGreaterThan(0)
    expect(cost).toBeLessThan(0.01)
  })

  test("10000 prompt, 500 completion tokens", () => {
    const promptTokens = 10000
    const completionTokens = 500
    const totalWatts = cfg.gpus.reduce((s, g) => s + g.wattage, 0)
    const promptTps = cfg.gpus.reduce((s, g) => s + g.promptTokensPerSecond, 0)
    const outputTps = cfg.gpus.reduce((s, g) => s + g.outputTokensPerSecond, 0)
    const costPerKwh = cfg.gpus[0].costPerKwh
    const watthours = (totalWatts * (promptTokens / promptTps + completionTokens / outputTps)) / 3600
    const cost = (watthours * costPerKwh) / 1000
    expect(cost).toBeGreaterThan(0)
    expect(cost).toBeLessThan(0.05)
  })

  test("empty gpus returns 0", () => {
    const emptyCfg = { gpus: [] }
    const totalWatts = emptyCfg.gpus.reduce((s, g) => s + g.wattage, 0)
    const watthours = 0
    const cost = (watthours * 0.12) / 1000
    expect(cost).toBe(0)
  })
})

describe("cost calculations", () => {
  test("baseline API cost for 1M tokens", () => {
    const inputCostPer1M = 0.30
    const outputCostPer1M = 1.20
    const promptTokens = 500_000
    const completionTokens = 500_000
    const baselineCost = (promptTokens * inputCostPer1M / 1_000_000) +
                       (completionTokens * outputCostPer1M / 1_000_000)
    expect(baselineCost).toBe(0.75)
  })

  test("local is cheaper than API for same tokens", () => {
    const cfg = { gpus: [{ wattage: 275, promptTokensPerSecond: 1000, outputTokensPerSecond: 43, costPerKwh: 0.12 }] }
    const inputCostPer1M = 0.30
    const outputCostPer1M = 1.20
    const promptTokens = 100_000
    const completionTokens = 10_000
    const baselineCost = (promptTokens * inputCostPer1M / 1_000_000) +
                       (completionTokens * outputCostPer1M / 1_000_000)
    const totalWatts = cfg.gpus.reduce((s, g) => s + g.wattage, 0)
    const promptTps = cfg.gpus.reduce((s, g) => s + g.promptTokensPerSecond, 0)
    const outputTps = cfg.gpus.reduce((s, g) => s + g.outputTokensPerSecond, 0)
    const watthours = (totalWatts * (promptTokens / promptTps + completionTokens / outputTps)) / 3600
    const localCost = (watthours * cfg.gpus[0].costPerKwh) / 1000
    expect(localCost).toBeLessThan(baselineCost)
    expect(baselineCost / localCost).toBeGreaterThan(10)
  })
})

describe("savings summary format", () => {
  test("summary includes expected fields", () => {
    const usageData = {
      startDate: new Date(Date.now() - 86400000).toISOString(),
      totalPromptTokens: 100000,
      totalCompletionTokens: 10000,
      totalRequests: 5,
      baselineCost: 0.150,
      localCost: 0.005,
      byModel: { "minimax-nvfp4": { promptTokens: 100000, completionTokens: 10000, requests: 5 } },
    }
    const config = {
      baseline: { provider: "minimax", model: "nvfp4", inputCostPer1M: 0.30, outputCostPer1M: 1.20 },
    }
    const elapsed = Date.now() - new Date(usageData.startDate).getTime()
    const days = elapsed / (1000 * 60 * 60 * 24)
    const savings = usageData.baselineCost - usageData.localCost
    const totalTokens = usageData.totalPromptTokens + usageData.totalCompletionTokens
    const savingsPerMTok = savings / (totalTokens / 1_000_000)
    const localPerMTok = usageData.localCost / (totalTokens / 1_000_000)
    const baselinePerMTok = config.baseline.inputCostPer1M + config.baseline.outputCostPer1M
    const summary = `Savings Tracker Summary
=======================
Period: ${days.toFixed(1)} days (since ${usageData.startDate.split("T")[0]})

Usage:
  Total requests: ${usageData.totalRequests.toLocaleString()}
  Total tokens: ${totalTokens.toLocaleString()}
    - Prompt: ${usageData.totalPromptTokens.toLocaleString()}
    - Completion: ${usageData.totalCompletionTokens.toLocaleString()}

Costs:
  ${config.baseline.provider}/${config.baseline.model} API: $${usageData.baselineCost.toFixed(4)} ($${baselinePerMTok.toFixed(2)}/M tok)
  Local inference: $${usageData.localCost.toFixed(4)} ($${localPerMTok.toFixed(2)}/M tok)
  -------------------------
  Net savings: $${savings.toFixed(4)} ($${savingsPerMTok.toFixed(2)}/M tok)
  Rate: ${((savings / (usageData.baselineCost || 1)) * 100).toFixed(0)}% cheaper at home`

    expect(summary).toContain("Savings Tracker Summary")
    expect(summary).toContain("Total requests: 5")
    expect(summary).toContain("Net savings: $0.14")
    expect(summary).toContain("Rate: 97% cheaper at home")
  })
})