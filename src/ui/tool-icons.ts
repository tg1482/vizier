import type { Node } from "../core/types"
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export type UiSpec = {
  iconText?: string
  iconId?: string
  color?: string
  label?: string
}

export type ToolIconRule = {
  icon?: string
  iconId?: string
  tool?: string
  toolPattern?: string
  inputContains?: string
  inputPattern?: string
  source?: string
}

type ToolMatch = {
  name: string
  input: string
  source?: string
}

function normalizeToolName(name: string): string {
  return name.trim().toLowerCase()
}

function baseToolName(name: string): string {
  const normalized = normalizeToolName(name)
  const parts = normalized.split(/[/:]/).filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : normalized
}

const DEFAULT_RULES: ToolIconRule[] = [
  { tool: "bash", inputPattern: "\\bgit\\b", icon: "🌿" },
  { tool: "bash", inputPattern: "\\bgrep\\b", icon: "🔎" },
  { tool: "bash", iconId: "simple-icons:gnubash", icon: "🖥️" },
  { tool: "shell", iconId: "simple-icons:gnubash", icon: "🖥️" },
  { tool: "git", iconId: "simple-icons:git", icon: "🌿" },
  { tool: "github", iconId: "simple-icons:github", icon: "🐙" },
  { tool: "python", iconId: "simple-icons:python", icon: "🐍" },
  { tool: "read", icon: "📖" },
  { tool: "write", icon: "📝" },
  { tool: "edit", icon: "🧵" },
  { tool: "patch", icon: "🧩" },
  { tool: "file", icon: "📄" },
  { tool: "search", icon: "🔍" },
  { tool: "web", icon: "🌐" },
  { tool: "http", icon: "🌐" },
  { tool: "fetch", icon: "📡" },
]

const USER_RULES_PATH = (() => {
  if (process.env.VIZIER_TOOL_ICONS) return process.env.VIZIER_TOOL_ICONS
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config")
  return join(base, "vizier", "tool-icons.json")
})()

let cachedRules: ToolIconRule[] | null = null

function readUserRules(): ToolIconRule[] {
  try {
    if (!existsSync(USER_RULES_PATH)) return []
    const raw = readFileSync(USER_RULES_PATH, "utf8")
    const parsed = JSON.parse(raw) as { rules?: ToolIconRule[] }
    return Array.isArray(parsed?.rules) ? parsed.rules : []
  } catch {
    return []
  }
}

function loadRules(): ToolIconRule[] {
  if (!cachedRules) {
    const userRules = readUserRules()
    cachedRules = [...userRules, ...DEFAULT_RULES]
  }
  return cachedRules
}

function ruleMatches(rule: ToolIconRule, match: ToolMatch): boolean {
  if (rule.source && rule.source !== match.source) return false

  if (rule.tool) {
    const target = normalizeToolName(rule.tool)
    if (normalizeToolName(match.name) !== target && baseToolName(match.name) !== target) return false
  }

  if (rule.toolPattern) {
    try {
      const re = new RegExp(rule.toolPattern, "i")
      if (!re.test(match.name)) return false
    } catch {
      return false
    }
  }

  if (rule.inputContains) {
    if (!match.input) return false
    if (!match.input.toLowerCase().includes(rule.inputContains.toLowerCase())) return false
  }

  if (rule.inputPattern) {
    if (!match.input) return false
    try {
      const re = new RegExp(rule.inputPattern, "i")
      if (!re.test(match.input)) return false
    } catch {
      return false
    }
  }

  return true
}

function getToolMatch(node: Node): ToolMatch | null {
  if (node.nodeType.kind !== "tool_call" && node.nodeType.kind !== "tool_use") return null
  return {
    name: node.nodeType.name,
    input: node.nodeType.input ?? "",
    source: node.source,
  }
}

export function getToolUi(node: Node): UiSpec | null {
  const match = getToolMatch(node)
  if (!match) return null
  const rules = loadRules()
  for (const rule of rules) {
    if (ruleMatches(rule, match)) {
      return { iconText: rule.icon, iconId: rule.iconId }
    }
  }
  return null
}

export { USER_RULES_PATH }
