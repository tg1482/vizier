# Vizier

**Timeline visualizer for Claude Code and OpenCode sessions.**

Watch your sessions unfold on a horizontal timeline — zoom between high-level conversation flow and full execution detail. Built with TypeScript, Bun, and React Ink.

![Vizier TUI screenshot](assets/vizier.png)

## Features

- **Real-time updates** — watches session files as Claude Code runs
- **Session switching** — auto-discovers sessions, press `s` to browse
- **Follow mode** — `f` to auto-track the latest node in a live session
- **Preview mode** — `w` to see content snippets inline on the timeline
- **Token stats** — input/output/cache token counts in the status bar
- **Sticky context** — shows the most recent parent node before the viewport
- **Agent discovery** — automatically finds and visualizes subagent branches (see `AGENTS.md`)
- **Tool icons** — customizable tool→emoji mapping for faster scanning

## Install

```bash
bun add -g vizier
```

## Sources

Vizier supports both **Claude Code** and **OpenCode** session data. By default, it will load **both**
when available and show them together in the session list. You can force a single source:

```bash
vizier --source claude
vizier --source opencode
vizier --source multi
```

## Tool Icon Mapping

Tool icons are configurable with a simple rules file. By default, Vizier ships with reasonable emojis, and
you can override or extend them.

Config path (default):
```
~/.config/vizier/tool-icons.json
```

Override path:
```
VIZIER_TOOL_ICONS=/path/to/tool-icons.json
```

Example:
```json
{
  "rules": [
    { "tool": "bash", "inputPattern": "\\bgit\\b", "icon": "🌿" },
    { "tool": "bash", "inputPattern": "\\bgrep\\b", "icon": "🔎" },
    { "tool": "bash", "icon": "🖥️" },
    { "tool": "read", "icon": "📖" },
    { "tool": "write", "icon": "📝" }
  ]
}
```
