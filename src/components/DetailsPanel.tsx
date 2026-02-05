import React from "react"
import { Box, Text } from "ink"
import type { Node } from "../core/types"

type Props = {
  node: Node | null
  levelName: string
  position: number
  total: number
  height: number
  scrollOffset: number
}

// Flatten node content into plain text lines with optional color hints
type ContentLine = { text: string; color?: string; dimColor?: boolean; bold?: boolean }

function nodeToLines(node: Node): ContentLine[] {
  const lines: ContentLine[] = []
  const time = new Date(node.timestamp).toISOString().replace("T", " ").slice(0, 19)
  lines.push({ text: `ID: ${node.id}`, dimColor: true })
  lines.push({ text: `Time: ${time}`, dimColor: true })
  lines.push({ text: `Branch Level: ${node.branchLevel}`, dimColor: true })
  if (node.model) lines.push({ text: `Model: ${node.model}`, dimColor: true })
  if (node.usage) {
    const u = node.usage
    const parts = [`in:${u.input_tokens ?? 0}`, `out:${u.output_tokens ?? 0}`]
    if (u.cache_read_input_tokens) parts.push(`cache_read:${u.cache_read_input_tokens}`)
    if (u.cache_creation_input_tokens) parts.push(`cache_create:${u.cache_creation_input_tokens}`)
    lines.push({ text: `Tokens: ${parts.join(" ")}`, dimColor: true })
  }
  lines.push({ text: "" })

  switch (node.nodeType.kind) {
    case "user":
      lines.push({ text: "User Message:", color: "cyan" })
      for (const l of node.nodeType.text.split("\n")) lines.push({ text: l })
      break
    case "assistant":
      lines.push({ text: "Assistant Message:", color: "green" })
      for (const l of node.nodeType.text.split("\n")) lines.push({ text: l })
      break
    case "tool_use":
      lines.push({ text: `Tool: ${node.nodeType.name}`, color: "yellow" })
      lines.push({ text: "" })
      jsonToLines(lines, node.nodeType.input, 0)
      break
    case "tool_result": {
      const color = node.nodeType.isError ? "red" : "green"
      lines.push({ text: "Tool Result:", color })
      lines.push({ text: "" })
      const out = node.nodeType.output.trim()
      if (out) {
        jsonToLines(lines, out, 0)
      } else {
        lines.push({ text: "(empty result)", dimColor: true })
      }
      break
    }
    case "agent_start":
      lines.push({ text: "Agent Start:", color: "magenta" })
      lines.push({ text: `Type: ${node.nodeType.agentType}` })
      lines.push({ text: `ID: ${node.nodeType.agentId}` })
      break
    case "agent_end":
      lines.push({ text: "Agent End:", dimColor: true })
      lines.push({ text: `ID: ${node.nodeType.agentId}` })
      break
    case "progress":
      lines.push({ text: "Progress:", dimColor: true })
      lines.push({ text: node.nodeType.text })
      break
  }
  return lines
}

function jsonToLines(lines: ContentLine[], text: string, indent: number) {
  try {
    const parsed = JSON.parse(text)
    jsonValueToLines(lines, parsed, indent)
  } catch {
    for (const l of text.split("\n")) {
      lines.push({ text: "  ".repeat(indent) + l })
    }
  }
}

function jsonValueToLines(lines: ContentLine[], value: unknown, indent: number) {
  const pad = "  ".repeat(indent)

  if (value === null || value === undefined) {
    lines.push({ text: `${pad}null`, dimColor: true })
    return
  }
  if (typeof value === "string") {
    for (const l of value.split("\n")) {
      lines.push({ text: `${pad}${l}` })
    }
    return
  }
  if (typeof value === "number" || typeof value === "boolean") {
    lines.push({ text: `${pad}${value}` })
    return
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < Math.min(value.length, 10); i++) {
      lines.push({ text: `${pad}[${i}]`, dimColor: true })
      jsonValueToLines(lines, value[i], indent + 1)
    }
    if (value.length > 10) {
      lines.push({ text: `${pad}... ${value.length - 10} more items`, dimColor: true })
    }
    return
  }
  if (typeof value === "object") {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (typeof val === "object" && val !== null) {
        lines.push({ text: `${pad}${key}:`, color: "yellow" })
        jsonValueToLines(lines, val, indent + 1)
      } else {
        const valStr = val === null ? "null" : typeof val === "string" ? val : String(val)
        // Store as composite — key colored, value plain
        lines.push({ text: `${pad}${key}: ${valStr}`, color: "yellow", _keyLen: key.length + 2 } as any)
      }
    }
    return
  }
  lines.push({ text: `${pad}${value}` })
}

export function DetailsPanel({ node, levelName, position, total, height, scrollOffset }: Props) {
  if (!node) {
    return (
      <Box flexDirection="column" height={height} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>No node selected</Text>
      </Box>
    )
  }

  const allLines = nodeToLines(node)
  const innerHeight = height - 2 // border top + bottom
  const maxScroll = Math.max(0, allLines.length - innerHeight)
  const offset = Math.min(scrollOffset, maxScroll)
  const visibleLines = allLines.slice(offset, offset + innerHeight)
  const hasMore = allLines.length > innerHeight

  const title = ` ${levelName} ${position}/${total} `
  const scrollHint = hasMore
    ? ` [${offset + 1}-${Math.min(offset + innerHeight, allLines.length)}/${allLines.length}] J/K:scroll `
    : ""

  return (
    <Box flexDirection="column" height={height} borderStyle="single" borderColor="gray" paddingX={1}>
      <Text>
        <Text bold>{title}</Text>
        <Text dimColor>{scrollHint}</Text>
      </Text>
      {visibleLines.map((line, i) => {
        // Handle key:value lines where key should be colored
        const keyLen = (line as any)._keyLen as number | undefined
        if (keyLen && line.color) {
          const pad = line.text.length - line.text.trimStart().length
          const prefix = line.text.slice(0, pad)
          const keyPart = line.text.slice(pad, pad + keyLen)
          const valPart = line.text.slice(pad + keyLen)
          return (
            <Text key={i}>
              {prefix}<Text color={line.color as any}>{keyPart}</Text>{valPart}
            </Text>
          )
        }
        return (
          <Text key={i} color={line.color as any} dimColor={line.dimColor} bold={line.bold}>
            {line.text}
          </Text>
        )
      })}
    </Box>
  )
}
