# agent-host-protocol-ui

A fully client-side web interface for services implementing the [Agent Host Protocol (AHP)](https://github.com/microsoft/agent-host-protocol), inspired by the **VS Code Agents view**.

`agent-host-protocol-ui` runs entirely in the browser without any intermediary backend. It connects directly over WebSockets to any AHP host (such as [`pi-agent-host-protocol`](https://github.com/toumorokoshi/pi-agent-host-protocol)), enabling developers to list, inspect, resume, and drive agent sessions with the full feature fidelity of modern agent IDE environments.

---

## Features (Inspired by VS Code Agents View)

- 🌐 **Direct Browser-to-Host Connection:**
  - Connect to local or remote AHP hosts via WebSocket (`ws://` / `wss://` with authentication token query parameters).
  - Multi-host registry persisted in browser `localStorage`.
  - Automatic reconnect, handshake negotiation (0.9.x through 1.x), and state replay (`AhpStateMirror`).

- 📋 **Live Session Explorer & Management:**
  - Real-time catalog of active sessions, including live TUI terminal sessions bridged from interactive `pi` instances and background agent workers.
  - Search and filter by session title, working directory, and active status.
  - Create new sessions with working directory selection and model/reasoning effort configuration (`resolveSessionConfig`).
  - Session rename (`session/titleChanged`), archive toggle, and disposal of empty sessions.

- 💬 **Full-Fidelity Conversational Turns:**
  - **Streaming Assistant Responses:** High-speed streaming markdown rendering with code syntax highlighting and copy controls.
  - **Collapsible Reasoning Streams:** Real-time visibility into the agent's chain-of-thought, including elapsed timer and token counts.
  - **Rich Tool Call Lifecycle:**
    - Visual inspection of tool names, arguments, and execution statuses (`streaming`, `running`, `completed`, `cancelled`).
    - Tool execution output with unified diff rendering for file edits.
    - **Interactive Tool Approvals:** Permission prompts for sensitive tool executions with Approve / Reject actions (`chat/toolCallConfirmed`).
  - **Resumable Errors:** Mid-turn recovery support when model servers encounter transient errors, offering one-click "Resume Turn" (`chat/turnResume`).
  - **Interactive Input Elicitations:** Renders forms for agent questions (text, number, boolean, single/multi select choices) with direct submission (`ChatInputRequest`).
  - **Turn Metrics:** Per-turn prompt/completion tokens, cached tokens, and execution durations.

- ⚡ **Steering, Queueing & Smart Input Composer:**
  - **Slash Command Completions (`/`):** Dynamic autocomplete for skills and prompt templates fetched via the `completions` RPC.
  - **Turn Cancellation:** Prominent Stop / Abort button (`chat/turnCancelled`) while turns are in progress.
  - **Mid-Flight Steering:** Send steering messages (`chat/pendingMessageSet` with `kind: steering`) to adjust the agent's direction without cancelling.
  - **Message Queueing:** Enqueue follow-up prompts (`kind: queued`) that trigger automatically upon turn completion, complete with reorder and delete controls.
  - **Input Draft Synchronization:** Real-time debounced draft sync (`chat/draftChanged`).

- 🖥️ **Integrated Tooling & Auxiliary Panels:**
  - **Interactive Terminals:** Full terminal emulator (xterm.js) embedded in the UI, connected to host ptys via `ahp-terminal:` channels.
  - **Skills & MCP Browser:** Detailed inspector for active skills, prompt templates, and agent tools.
  - **Changeset Inspector:** Review file changes and unified diffs generated during sessions.

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    Browser Session (SPA)                   │
│                                                            │
│   ┌─────────────────────────────────────────────────────┐  │
│   │           UI Components (Vite + React + CSS)        │  │
│   │  • Host Switcher  • Sessions Sidebar  • Chat Stream │  │
│   │  • Composer       • Tool Approvals    • Terminals   │  │
│   └──────────────────────────┬──────────────────────────┘  │
│                              │                             │
│   ┌──────────────────────────▼──────────────────────────┐  │
│   │            @microsoft/agent-host-protocol           │  │
│   │  • WebSocketTransport                               │  │
│   │  • AhpClient & ManagedSubscriptionManager           │  │
│   │  • AhpStateMirror (Root, Session, Chat State)       │  │
│   └──────────────────────────┬──────────────────────────┘  │
└──────────────────────────────┼─────────────────────────────┘
                               │ WebSocket (JSON-RPC 2.0)
                               ▼
              ┌─────────────────────────────────┐
              │     Agent Host Protocol Host    │
              │  (e.g., pi-agent-host-protocol) │
              └─────────────────────────────────┘
```

The application is completely self-contained. It requires no backend server or Node.js proxy to operate—it directly talks JSON-RPC 2.0 over WebSocket to any AHP compliant server.

---

## Quickstart

### Prerequisites
- Node.js 22 or later
- npm or pnpm

### Development

```sh
# Install dependencies
npm install

# Start development server
npm run dev

# Run linter and typecheck
just lint

# Automatically format and fix issues
just fix
```

Once running, navigate to `http://localhost:5173` in your browser. Enter your agent host WebSocket URL (for instance, `ws://127.0.0.1:63877?tkn=your-token`) in the host connection modal to begin interacting with your agent sessions.

---

## Documentation

- [Detailed Specification](specs/agent-host-protocol-ui.md)
- [Gaps & Implementation Roadmap](GAPS.md)
- [License (Apache-2.0)](LICENSE)
