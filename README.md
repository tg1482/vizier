# Vizzy 🔮

**Multi-zoom timeline visualizer for Claude Code.**

Navigate your session at different altitudes - zoom out for the big picture, zoom in for details.

## Quick Start

```bash
make dev
```

## The Zoom Concept

### CONVERSATIONS Mode (Default)
High-level view - just User ↔ Assistant turns

```
[CONVERSATIONS] z:zoom h/l:scroll j/k:select q:quit

Time  10:30  10:32  10:35  10:38  10:42

L0    ●──────◉──────●──────◉──────●──────

85 nodes | Showing 1-23
```

**Press 'z' to zoom in →**

### DETAILS Mode
Full execution tree - see tools, agents, everything

```
[DETAILS] z:zoom h/l:scroll j/k:select q:quit

Time  10:30  10:32        10:34  10:35

L0    ●──────◉──────────────────────────
L1           └──⬢──✓──⟐──⬢──⬢──✓──⟐↑──

      User  Asst Task OK Expl Read...
```

**Press 'x' to zoom out →**

## Symbols

- `●` User message
- `◉` Assistant message
- `⬢` Tool call (Read, Write, Grep, etc.)
- `✓` Success / `✗` Error
- `⟐` Agent (spawn/end)
- `○` Progress

## Controls

- `z` - Zoom IN (more detail)
- `x` - Zoom OUT (less detail)
- `h/l` - Scroll timeline
- `j/k` - Select nodes
- `g/G` - Jump start/end
- `q` - Quit

## Why This Works

**CONVERSATIONS**: Clean, readable, just the dialogue
**DETAILS**: Full execution graph when you need it

Flow between zoom levels naturally - no clicking menus, no scrolling lists.

## What You Get

- **Horizontal timeline**: Time flows left→right
- **Branch levels**: L0 (main), L1+ (agents/subprocesses)
- **Timestamps**: See exact timing
- **Adaptive density**: Show what you need, when you need it

## Install

```bash
./install.sh
```

---

*Built with Claude Code.*
