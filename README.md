# Vizier

**Timeline visualizer for Claude Code sessions.**

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

## Install

```bash
bun add -g vizier
```
