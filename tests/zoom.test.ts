import { describe, it, expect } from "bun:test"
import type { Node } from "../src/core/types"
import { getVisualBranch, filterByZoom, getNodePreview, findStickyNode } from "../src/core/zoom"

function node(kind: Node["nodeType"]["kind"], branchLevel = 0): Node {
  return {
    id: `${kind}-${branchLevel}`,
    nodeType: { kind } as any,
    timestamp: 0,
    branchLevel,
  }
}

describe("getVisualBranch", () => {
  it("maps main session rows in details", () => {
    expect(getVisualBranch(node("user"), "details")).toBe(0)
    expect(getVisualBranch(node("assistant"), "details")).toBe(1)
    expect(getVisualBranch(node("tool_use"), "details")).toBe(2)
  })

  it("maps agent rows in details", () => {
    const agentAsst = { ...node("assistant", 1), agentId: "a1" }
    const agentTool = { ...node("tool_use", 1), agentId: "a1" }
    expect(getVisualBranch(agentAsst, "details")).toBe(3)
    expect(getVisualBranch(agentTool, "details")).toBe(4)
  })

  it("filters agent tools in conversations", () => {
    const agentAsst = { ...node("assistant", 1), agentId: "a1" }
    const agentTool = { ...node("tool_use", 1), agentId: "a1" }
    expect(getVisualBranch(agentAsst, "conversations")).toBe(3)
    expect(getVisualBranch(agentTool, "conversations")).toBe(-1)
  })
})

describe("filterByZoom", () => {
  it("keeps only user/assistant in conversations", () => {
    const nodes: Node[] = [
      node("user"),
      node("assistant"),
      node("tool_use"),
      { ...node("assistant", 1), agentId: "a1" },
      { ...node("tool_use", 1), agentId: "a1" },
    ]
    const indices = filterByZoom(nodes, "conversations")
    const kinds = indices.map(i => nodes[i].nodeType.kind)
    expect(kinds).toEqual(["user", "assistant", "assistant"])
  })
})

describe("getNodePreview", () => {
  it("summarizes tool and result nodes", () => {
    const toolCall = {
      id: "t1",
      nodeType: { kind: "tool_call", name: "read", input: "", output: "ok", isError: false },
      timestamp: 0,
      branchLevel: 0,
    } as Node
    const toolResult = {
      id: "t2",
      nodeType: { kind: "tool_result", output: "err", isError: true },
      timestamp: 0,
      branchLevel: 0,
    } as Node
    expect(getNodePreview(toolCall, 10)).toBe("read")
    expect(getNodePreview(toolResult, 10)).toBe("error")
  })
})

describe("findStickyNode", () => {
  it("finds last node in branch before column", () => {
    const nodes: Node[] = [
      { id: "u1", nodeType: { kind: "user", text: "a" }, timestamp: 1, branchLevel: 0 },
      { id: "a1", nodeType: { kind: "assistant", text: "b" }, timestamp: 2, branchLevel: 0 },
      { id: "t1", nodeType: { kind: "tool_use", name: "read", input: "" }, timestamp: 3, branchLevel: 0 },
    ]
    const visible = [0, 1, 2]
    const idx = findStickyNode(nodes, visible, 1, 2, "details")
    expect(idx).toBe(1)
  })
})
