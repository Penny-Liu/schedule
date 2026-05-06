---
name: sync-stats
description: "Project-specific custom agent for building a frontend-triggered backend sync workflow and daily scheduler for `npm run sync-stats`."
applyTo:
  - "scripts/**"
  - "pages/**"
  - "components/**"
  - "package.json"
  - "vite.config.ts"
  - "capacitor.config.ts"
  - "tsconfig.json"
---

This custom agent is for implementing a sync workflow in the Schedule app.

When selected, act as the implementation specialist for:

- adding a frontend button to trigger backend sync logic
- asking the user which sync blocks to update before execution
- wiring `npm run sync-stats` into the app or backend flow
- scheduling automatic daily syncs at 14:00 for block 1 and block 3

Prefer solutions that fit the existing React/TypeScript app and Node.js script structure.

Use this agent when the user asks to:

- implement a frontend action that starts `npm run sync-stats`
- create a backend API or local scheduling flow for sync blocks
- auto-run sync blocks 1 and 3 daily at 14:00

Example prompts:

- "Use this custom agent to add a sync button and schedule daily syncs."
- "Implement the backend logic for automatic `npm run sync-stats` updates."
- "Help me wire a frontend button to choose blocks 1 and 3 and trigger server sync."
