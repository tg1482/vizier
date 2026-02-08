import { describe, it, expect } from "bun:test"
import { writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

type ToolNode = {
  nodeType: { kind: "tool_call" | "tool_use"; name: string; input: string }
  source?: string
}

async function loadModule(path: string) {
  const mod = await import(`${path}?t=${Date.now()}-${Math.random()}`)
  return mod as typeof import("../src/ui/tool-icons")
}

describe("tool icon rules", () => {
  it("matches tool name and inputPattern (bash git)", async () => {
    const configPath = join(tmpdir(), `vizier-tool-icons-${Date.now()}.json`)
    writeFileSync(
      configPath,
      JSON.stringify({
        rules: [
          { tool: "bash", inputPattern: "\\bgit\\b", icon: "🌿" },
          { tool: "bash", icon: "🖥️" },
        ],
      }),
    )
    process.env.VIZIER_TOOL_ICONS = configPath
    const { getToolUi } = await loadModule("../src/ui/tool-icons.ts")

    const node: ToolNode = {
      nodeType: { kind: "tool_call", name: "bash", input: "git status" },
      source: "claude",
    }
    const ui = getToolUi(node as any)
    expect(ui?.iconText).toBe("🌿")
  })

  it("falls back to broader rule when inputPattern doesn't match", async () => {
    const configPath = join(tmpdir(), `vizier-tool-icons-${Date.now()}.json`)
    writeFileSync(
      configPath,
      JSON.stringify({
        rules: [
          { tool: "bash", inputPattern: "\\bgit\\b", icon: "🌿" },
          { tool: "bash", icon: "🖥️" },
        ],
      }),
    )
    process.env.VIZIER_TOOL_ICONS = configPath
    const { getToolUi } = await loadModule("../src/ui/tool-icons.ts")

    const node: ToolNode = {
      nodeType: { kind: "tool_use", name: "bash", input: "ls -la" },
      source: "opencode",
    }
    const ui = getToolUi(node as any)
    expect(ui?.iconText).toBe("🖥️")
  })

  it("supports toolPattern and inputContains", async () => {
    const configPath = join(tmpdir(), `vizier-tool-icons-${Date.now()}.json`)
    writeFileSync(
      configPath,
      JSON.stringify({
        rules: [
          { toolPattern: "^read", icon: "📖" },
          { tool: "bash", inputContains: "grep", icon: "🔎" },
        ],
      }),
    )
    process.env.VIZIER_TOOL_ICONS = configPath
    const { getToolUi } = await loadModule("../src/ui/tool-icons.ts")

    const readNode: ToolNode = {
      nodeType: { kind: "tool_call", name: "read_file", input: "" },
    }
    const bashNode: ToolNode = {
      nodeType: { kind: "tool_call", name: "bash", input: "grep foo file.txt" },
    }
    expect(getToolUi(readNode as any)?.iconText).toBe("📖")
    expect(getToolUi(bashNode as any)?.iconText).toBe("🔎")
  })

  it("filters by source when provided", async () => {
    const configPath = join(tmpdir(), `vizier-tool-icons-${Date.now()}.json`)
    writeFileSync(
      configPath,
      JSON.stringify({
        rules: [
          { tool: "read", source: "opencode", icon: "📄" },
          { tool: "read", source: "claude", icon: "📖" },
        ],
      }),
    )
    process.env.VIZIER_TOOL_ICONS = configPath
    const { getToolUi } = await loadModule("../src/ui/tool-icons.ts")

    const oc: ToolNode = {
      nodeType: { kind: "tool_call", name: "read", input: "" },
      source: "opencode",
    }
    const cl: ToolNode = {
      nodeType: { kind: "tool_call", name: "read", input: "" },
      source: "claude",
    }
    expect(getToolUi(oc as any)?.iconText).toBe("📄")
    expect(getToolUi(cl as any)?.iconText).toBe("📖")
  })

  it("matches base tool names (tools/read)", async () => {
    const configPath = join(tmpdir(), `vizier-tool-icons-${Date.now()}.json`)
    writeFileSync(
      configPath,
      JSON.stringify({
        rules: [
          { tool: "read", icon: "📖" },
        ],
      }),
    )
    process.env.VIZIER_TOOL_ICONS = configPath
    const { getToolUi } = await loadModule("../src/ui/tool-icons.ts")

    const node: ToolNode = {
      nodeType: { kind: "tool_call", name: "tools/read", input: "" },
    }
    expect(getToolUi(node as any)?.iconText).toBe("📖")
  })

  it("skips invalid regex rules and falls back", async () => {
    const configPath = join(tmpdir(), `vizier-tool-icons-${Date.now()}.json`)
    writeFileSync(
      configPath,
      JSON.stringify({
        rules: [
          { toolPattern: "[", icon: "🧨" },
          { tool: "read", icon: "📖" },
        ],
      }),
    )
    process.env.VIZIER_TOOL_ICONS = configPath
    const { getToolUi } = await loadModule("../src/ui/tool-icons.ts")

    const node: ToolNode = {
      nodeType: { kind: "tool_call", name: "read", input: "" },
    }
    expect(getToolUi(node as any)?.iconText).toBe("📖")
  })
})
