# Vizzy v1 - Causality Across Resolutions

## Core Concept

One persistent graph, viewed at different resolutions. Zooming reveals depth without changing the horizontal timeline structure.

## The Key Insight: Separate User/Assistant Rows

```
CONVERSATIONS (default - shows ALL dialogue):

Time    10:30  10:32  10:35  10:38  10:42  10:45
User    ●──────────────●─────────────●─────────────
Asst    ───●──────●──────●──────●──────●──────●────
```

**Why this matters:**
- Clear causality: User asks → Assistant responds
- See ALL conversation turns, not just 2
- Rhythm of dialogue is visible

## Zoom IN to DETAILS

```
Time    10:30  10:32        10:35      10:38
User    ●─────────────────●──────────●──────────────
Asst    ───●──────●──────────●──────────●──────────
L0         └─⬢─✓  └─⟐──────┘  └─⬢─✓
L1                  └─⬢─⬢─✓
```

**What changed:**
- Same timeline horizontally
- NEW rows appear below: Tools (L0), Agents (L1), etc.
- Parent-child relationships visible with connectors
- User/Asst rows stay in place - context preserved!

## Zoom IN to FOCUS

```
Same view, but selected node expands inline:

      ┌─────────────────────────┐
      │ TOOL: Bash              │
      ├─────────────────────────┤
      │ command: cargo build    │
      │ Result: Success         │
      └─────────────────────────┘
```

## Visual Branch Assignment

**CONVERSATIONS mode:**
- Branch 0: User messages
- Branch 1: Assistant messages

**DETAILS/FOCUS mode:**
- Branch 0: User messages
- Branch 1: Assistant messages
- Branch 2+: Tools, Agents (by actual branch_level)

This keeps User/Asst stable across zoom levels!

## What This Achieves

1. **Context preservation**: Zoom in, see more; zoom out, see less - but the SAME timeline
2. **Causality visible**: User → Asst → Tools flows clearly
3. **Resolution control**: Show appropriate detail for the task
4. **No view switching**: It's one graph, multiple resolutions

## Example Flow

```
Start: CONVERSATIONS
User    ●─────●─────●─────
Asst    ──●─────●─────●───

Press 'z': DETAILS
User    ●─────●─────●─────
Asst    ──●─────●─────●───
L0        └─⬢─✓ └─⬢─✓

Press 'z': FOCUS on a tool
User    ●─────●─────●─────
Asst    ──●─────●─────●───
L0        └─⬢─✓ [Expanded] ✓
           ┌────────────┐
           │ Tool: Read │
           │ file.rs    │
           └────────────┘
```

The horizontal axis (time) is CONSTANT. The vertical axis (depth) expands with zoom.

This is **causality across resolutions**.
