import { describe, it, expect } from "bun:test"
import type { SessionEvent } from "../src/core/types"
import { buildGraph } from "../src/sources/claude/graph"

function ts(n: number): string {
  return new Date(1_700_000_000_000 + n).toISOString()
}

describe("claude buildGraph", () => {
  it("merges tool_use + tool_result into tool_call", () => {
    const events: SessionEvent[] = [
      {
        uuid: "a1",
        type: "assistant",
        timestamp: ts(1),
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", id: "tool-1", name: "read", input: { file_path: "a.txt" } },
          ],
        },
      },
      {
        uuid: "u1",
        type: "user",
        timestamp: ts(2),
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "tool-1", content: "ok", is_error: false },
          ],
        },
      },
    ]

    const graph = buildGraph(events)
    const tool = graph.nodes.find(n => n.nodeType.kind === "tool_call")
    expect(tool?.nodeType.kind).toBe("tool_call")
    if (tool?.nodeType.kind === "tool_call") {
      expect(tool.nodeType.name).toBe("read")
      expect(tool.nodeType.output).toBe("ok")
      expect(tool.nodeType.isError).toBe(false)
    }
  })

  it("preserves orphan tool_result", () => {
    const events: SessionEvent[] = [
      {
        uuid: "u1",
        type: "user",
        timestamp: ts(1),
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "missing", content: "err", is_error: true },
          ],
        },
      },
    ]

    const graph = buildGraph(events)
    const result = graph.nodes.find(n => n.nodeType.kind === "tool_result")
    expect(result?.nodeType.kind).toBe("tool_result")
  })

  it("assigns agent branches and links first agent node to parent tool", () => {
    const events: SessionEvent[] = [
      {
        uuid: "a1",
        type: "assistant",
        timestamp: ts(1),
        message: { role: "assistant", content: [{ type: "tool_use", id: "tool-1", name: "bash", input: {} }] },
      },
      {
        uuid: "p1",
        type: "progress",
        timestamp: ts(2),
        data: { type: "agent_progress", agentId: "agent-1" },
        parentToolUseID: "tool-1",
      },
      {
        uuid: "p2",
        type: "progress",
        timestamp: ts(3),
        data: { type: "agent_progress", agentId: "agent-2" },
        parentToolUseID: "tool-1",
      },
      {
        uuid: "ag1",
        type: "assistant",
        agentId: "agent-1",
        timestamp: ts(4),
        message: { role: "assistant", content: "agent one" },
      },
      {
        uuid: "ag1b",
        type: "assistant",
        agentId: "agent-1",
        timestamp: ts(6),
        message: { role: "assistant", content: "agent one followup" },
      },
      {
        uuid: "ag2",
        type: "assistant",
        agentId: "agent-2",
        timestamp: ts(5), // overlaps agent-1 span -> separate branch
        message: { role: "assistant", content: "agent two" },
      },
    ]

    const graph = buildGraph(events)
    const agentNodes = graph.nodes.filter(n => n.agentId)
    expect(agentNodes.length).toBe(3)
    const branches = new Set(agentNodes.map(n => n.branchLevel))
    expect(branches.size).toBe(2)
    const linked = agentNodes.find(n => n.parentId === "tool-1")
    expect(linked).toBeTruthy()
  })

  it("parents tool_use to assistant text when present", () => {
    const events: SessionEvent[] = [
      {
        uuid: "asst-1",
        type: "assistant",
        timestamp: ts(1),
        parentUuid: "user-1",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "hello" },
            { type: "tool_use", id: "tool-1", name: "read", input: { file_path: "a.txt" } },
          ],
        },
      },
    ]
    const graph = buildGraph(events)
    const tool = graph.nodes.find(n => n.nodeType.kind === "tool_call")
    expect(tool?.parentId).toBe("asst-1")
  })

  it("merges multiple tool uses and results", () => {
    const events: SessionEvent[] = [
      {
        uuid: "asst-1",
        type: "assistant",
        timestamp: ts(1),
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", id: "tool-1", name: "read", input: { file_path: "a.txt" } },
            { type: "tool_use", id: "tool-2", name: "read", input: { file_path: "b.txt" } },
          ],
        },
      },
      {
        uuid: "user-1",
        type: "user",
        timestamp: ts(2),
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "tool-1", content: "A", is_error: false },
            { type: "tool_result", tool_use_id: "tool-2", content: "B", is_error: false },
          ],
        },
      },
    ]
    const graph = buildGraph(events)
    const calls = graph.nodes.filter(n => n.nodeType.kind === "tool_call")
    expect(calls.length).toBe(2)
    const outputs = calls.map(c => c.nodeType.kind === "tool_call" ? c.nodeType.output : null)
    expect(outputs).toEqual(expect.arrayContaining(["A", "B"]))
  })

  it("filters agent user nodes", () => {
    const events: SessionEvent[] = [
      {
        uuid: "u1",
        type: "user",
        agentId: "agent-1",
        timestamp: ts(1),
        message: { role: "user", content: "agent user msg" },
      },
    ]
    const graph = buildGraph(events)
    const agentUser = graph.nodes.find(n => n.agentId && n.nodeType.kind === "user")
    expect(agentUser).toBeUndefined()
  })
})
