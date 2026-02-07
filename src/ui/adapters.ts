import type { Node } from "../core/types"

export type UiSpec = {
  iconText?: string
  iconId?: string
  color?: string
  label?: string
}

export type UiAdapter = {
  id: string
  match: (node: Node) => boolean
  ui: (node: Node) => UiSpec
}

function normalizeToolName(name: string): string {
  return name.trim().toLowerCase()
}

function baseToolName(name: string): string {
  const normalized = normalizeToolName(name)
  const parts = normalized.split(/[/:]/).filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : normalized
}

const TOOL_ICON_MAP: Record<string, UiSpec> = {
  read: {},
  write: {},
  edit: {},
  patch: {},
  file: {},
  bash: { iconId: "simple-icons:gnubash" },
  shell: { iconId: "simple-icons:gnubash" },
  git: { iconId: "simple-icons:git" },
  github: { iconId: "simple-icons:github" },
  search: {},
  web: {},
  http: {},
  fetch: {},
  python: { iconId: "simple-icons:python" },
}

function lookupToolUi(name: string): UiSpec | null {
  const normalized = normalizeToolName(name)
  const base = baseToolName(name)
  if (TOOL_ICON_MAP[normalized]) return TOOL_ICON_MAP[normalized]
  if (TOOL_ICON_MAP[base]) return TOOL_ICON_MAP[base]
  if (normalized.startsWith("read")) return TOOL_ICON_MAP.read
  if (normalized.startsWith("write")) return TOOL_ICON_MAP.write
  if (normalized.startsWith("search")) return TOOL_ICON_MAP.search
  if (normalized.startsWith("git")) return TOOL_ICON_MAP.git
  return null
}

const DEFAULT_ADAPTERS: UiAdapter[] = [
  {
    id: "tool-by-name",
    match: node => node.nodeType.kind === "tool_call" || node.nodeType.kind === "tool_use",
    ui: node => {
      const name = node.nodeType.kind === "tool_call" || node.nodeType.kind === "tool_use"
        ? node.nodeType.name
        : ""
      return lookupToolUi(name) ?? {}
    },
  },
]

export function getNodeUi(node: Node, adapters: UiAdapter[] = DEFAULT_ADAPTERS): UiSpec | null {
  for (const adapter of adapters) {
    if (adapter.match(node)) return adapter.ui(node)
  }
  return null
}
