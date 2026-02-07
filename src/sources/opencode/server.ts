export type ServerClient = {
  subscribe(onEvent: (event: BusEvent) => void): () => void
  sendMessage(sessionId: string, text: string): Promise<void>
  abortSession(sessionId: string): Promise<void>
  isConnected(): boolean
}

export type BusEvent = {
  type: string
  [key: string]: unknown
}

export function connectToServer(url: string): ServerClient {
  let connected = false
  let eventSource: ReturnType<typeof createSSE> | null = null
  const listeners: Set<(event: BusEvent) => void> = new Set()

  // Start SSE connection
  function createSSE() {
    const eventUrl = `${url}/event`
    let controller: AbortController | null = new AbortController()

    ;(async () => {
      try {
        const response = await fetch(eventUrl, {
          headers: { Accept: "text/event-stream" },
          signal: controller!.signal,
        })

        if (!response.ok || !response.body) {
          connected = false
          return
        }

        connected = true
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          let currentData = ""
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              currentData += line.slice(6)
            } else if (line === "" && currentData) {
              try {
                const event = JSON.parse(currentData) as BusEvent
                for (const listener of listeners) {
                  listener(event)
                }
              } catch { /* ignore parse errors */ }
              currentData = ""
            }
          }
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          connected = false
        }
      }
    })()

    return {
      close() {
        controller?.abort()
        controller = null
        connected = false
      },
    }
  }

  eventSource = createSSE()

  return {
    subscribe(onEvent: (event: BusEvent) => void): () => void {
      listeners.add(onEvent)
      return () => { listeners.delete(onEvent) }
    },

    async sendMessage(sessionId: string, text: string): Promise<void> {
      const res = await fetch(`${url}/session/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parts: [{ type: "text", text }] }),
      })
      if (!res.ok) {
        throw new Error(`Failed to send message: ${res.status} ${res.statusText}`)
      }
    },

    async abortSession(sessionId: string): Promise<void> {
      const res = await fetch(`${url}/session/${sessionId}/abort`, {
        method: "POST",
      })
      if (!res.ok) {
        throw new Error(`Failed to abort session: ${res.status} ${res.statusText}`)
      }
    },

    isConnected(): boolean {
      return connected
    },
  }
}
