import React, { useState } from "react"
import { Box, Text } from "ink"
import TextInput from "ink-text-input"

type Props = {
  onSubmit: (text: string) => void
  onCancel: () => void
}

export function CommandInput({ onSubmit, onCancel }: Props) {
  const [value, setValue] = useState("")

  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>{">"} </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={(text) => {
          if (text.trim()) onSubmit(text.trim())
        }}
      />
      <Text dimColor> (Enter to send, Esc to cancel)</Text>
    </Box>
  )
}
