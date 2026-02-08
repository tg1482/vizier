import { describe, it, expect } from "bun:test"
import { mkdirSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"

function writeJson(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2))
}

async function loadGraphBuilder(storageDir: string) {
  delete process.env.HOME
  process.env.OPENCODE_STORAGE = storageDir
  const mod = await import(`../src/sources/opencode/graph.ts?t=${Date.now()}-${Math.random()}`)
  return mod as typeof import("../src/sources/opencode/graph")
}

describe("opencode buildOpenCodeGraph", () => {
  it("returns empty graph when no messages", async () => {
    const storage = join(tmpdir(), `oc-${Date.now()}`, "storage")
    const { buildOpenCodeGraph } = await loadGraphBuilder(storage)
    const graph = buildOpenCodeGraph("session-1")
    expect(graph.nodes.length).toBe(0)
  })

  it("maps messages and tool parts into nodes", async () => {
    const storage = join(tmpdir(), `oc-${Date.now()}`, "storage")
    const messageDir = join(storage, "message", "session-1")
    const partDirUser = join(storage, "part", "msg-user")
    const partDirAsst = join(storage, "part", "msg-asst")

    writeJson(join(messageDir, "msg-user.json"), {
      id: "msg-user",
      sessionID: "session-1",
      role: "user",
      time: { created: 1 },
    })
    writeJson(join(messageDir, "msg-asst.json"), {
      id: "msg-asst",
      sessionID: "session-1",
      role: "assistant",
      parentID: "msg-user",
      time: { created: 2 },
      modelID: "gpt-4",
      tokens: { input: 1, output: 2 },
    })

    writeJson(join(partDirUser, "p1.json"), {
      id: "p1",
      sessionID: "session-1",
      messageID: "msg-user",
      type: "text",
      text: "hello",
    })

    writeJson(join(partDirAsst, "p2.json"), {
      id: "p2",
      sessionID: "session-1",
      messageID: "msg-asst",
      type: "tool",
      tool: "read",
      state: { status: "completed", input: { file_path: "a.txt" }, output: "ok" },
    })

    const { buildOpenCodeGraph } = await loadGraphBuilder(storage)
    const graph = buildOpenCodeGraph("session-1")

    const user = graph.nodes.find(n => n.nodeType.kind === "user")
    const tool = graph.nodes.find(n => n.nodeType.kind === "tool_call")
    expect(user?.nodeType.kind).toBe("user")
    expect(tool?.nodeType.kind).toBe("tool_call")
    expect(user?.source).toBe("opencode")
    expect(tool?.source).toBe("opencode")
  })

  it("orders parts by id and maps reasoning + patch", async () => {
    const storage = join(tmpdir(), `oc-${Date.now()}`, "storage")
    const messageDir = join(storage, "message", "session-2")
    const partDirUser = join(storage, "part", "m-user")
    const partDirAsst = join(storage, "part", "m-asst")

    writeJson(join(messageDir, "m-user.json"), {
      id: "m-user",
      sessionID: "session-2",
      role: "user",
      time: { created: 1 },
    })
    writeJson(join(messageDir, "m-asst.json"), {
      id: "m-asst",
      sessionID: "session-2",
      role: "assistant",
      parentID: "m-user",
      time: { created: 2 },
      tokens: { input: 1, output: 2 },
    })

    writeJson(join(partDirUser, "p1.json"), {
      id: "p1",
      sessionID: "session-2",
      messageID: "m-user",
      type: "text",
      text: "hi",
    })

    writeJson(join(partDirAsst, "b.json"), {
      id: "b",
      sessionID: "session-2",
      messageID: "m-asst",
      type: "text",
      text: "second",
    })
    writeJson(join(partDirAsst, "a.json"), {
      id: "a",
      sessionID: "session-2",
      messageID: "m-asst",
      type: "reasoning",
      text: "first",
    })
    writeJson(join(partDirAsst, "c.json"), {
      id: "c",
      sessionID: "session-2",
      messageID: "m-asst",
      type: "patch",
      files: ["a.txt"],
      hash: "deadbeef",
    })

    const { buildOpenCodeGraph } = await loadGraphBuilder(storage)
    const graph = buildOpenCodeGraph("session-2")

    const partNodes = graph.nodes.filter(n => n.id === "a" || n.id === "b")
    expect(partNodes.map(n => n.id)).toEqual(["a", "b"])

    const reasoning = graph.nodes.find(n => n.nodeType.kind === "reasoning")
    const patch = graph.nodes.find(n => n.nodeType.kind === "patch")
    expect(reasoning).toBeTruthy()
    expect(patch).toBeTruthy()
  })

  it("aggregates stats from assistant messages", async () => {
    const storage = join(tmpdir(), `oc-${Date.now()}`, "storage")
    const messageDir = join(storage, "message", "session-3")
    const partDirUser = join(storage, "part", "m-user")

    writeJson(join(messageDir, "m-user.json"), {
      id: "m-user",
      sessionID: "session-3",
      role: "user",
      time: { created: 1 },
    })
    writeJson(join(messageDir, "m-asst.json"), {
      id: "m-asst",
      sessionID: "session-3",
      role: "assistant",
      parentID: "m-user",
      time: { created: 2 },
      tokens: { input: 3, output: 4, reasoning: 2, cache: { read: 1, write: 2 } },
    })
    writeJson(join(partDirUser, "p1.json"), {
      id: "p1",
      sessionID: "session-3",
      messageID: "m-user",
      type: "text",
      text: "hi",
    })

    const { buildOpenCodeGraph } = await loadGraphBuilder(storage)
    const graph = buildOpenCodeGraph("session-3")
    expect(graph.stats.totalInputTokens).toBe(3)
    expect(graph.stats.totalOutputTokens).toBe(4)
    expect(graph.stats.totalReasoningTokens).toBe(2)
    expect(graph.stats.totalCacheRead).toBe(1)
    expect(graph.stats.totalCacheCreation).toBe(2)
  })
})
