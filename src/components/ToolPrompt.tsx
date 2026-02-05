import React from "react"
import { Box, Text } from "ink"

type Props = {
  toolName: string
  input: unknown
}

export function ToolPrompt({ toolName, input }: Props) {
  const preview = JSON.stringify(input, null, 2).split("\n").slice(0, 5).join("\n")

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={1}>
      <Text color="yellow" bold>Tool Permission Request</Text>
      <Text> </Text>
      <Text>Tool: <Text color="yellow" bold>{toolName}</Text></Text>
      <Text dimColor>{preview}</Text>
      <Text> </Text>
      <Text>Press <Text color="green" bold>y</Text> to approve, <Text color="red" bold>n</Text> to deny</Text>
    </Box>
  )
}
