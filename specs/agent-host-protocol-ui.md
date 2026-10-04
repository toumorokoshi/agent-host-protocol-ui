# Specification: Agent Host Protocol Client-Side UI

**Status:** Proposed  
**Document Version:** 1.0.0  
**Target Package:** `agent-host-protocol-ui`  
**Reference Protocol:** Agent Host Protocol (AHP) v0.9.x / v1.x (`@microsoft/agent-host-protocol`)  
**Inspiration:** VS Code Agents View (`chat.remoteAgentHostsEnabled`, "Agents" window)

---

## 1. Overview & Objectives

### 1.1 Goal
Provide a rich, responsive, fully client-side web application running in a standard modern browser to connect to, inspect, and drive AI agent sessions hosted by any server implementing the **Agent Host Protocol (AHP)** (such as [`pi-agent-host-protocol`](https://github.com/toumorokoshi/pi-agent-host-protocol)).

### 1.2 Design Philosophy
- **Client-Side Only:** No intermediary application backend required. The browser connects directly to the AHP host over WebSockets (`ws://` or `wss://`), utilizing the browser runtime capabilities of `@microsoft/agent-host-protocol/client` and `@microsoft/agent-host-protocol/ws`.
- **VS Code Agents View Fidelity:** Emulate and enhance the user experience of VS Code's native Agents window—supporting session catalogs, streaming responses, reasoning steps, tool call inspections with approval flows, steering, message queueing, resumable errors, and interactive terminals.
- **Modern, Premium Aesthetics:** Dark-mode first design adhering to modern IDE visual standards with clean typography, micro-interactions, distinct state indicators, and syntax-highlighted code and tool call views.
- **Protocol Completeness:** Full support for core channels: `ahp-root://`, `ahp-session:/{id}`, `ahp-chat:/{id}`, and `ahp-terminal:/{id}`.

---

## 2. Feature Analysis & Inspiration from VS Code Agents View

The VS Code Agents View represents Microsoft's architecture for decoupling agent execution hosts from agent user interfaces. A comprehensive study of the VS Code Agents view reveals the following key capabilities that this UI must support:

### 2.1 Host Connection & Multi-Host Management
- **Connection Configuration:** Users can add multiple remote agent hosts via WebSocket URL (including authentication tokens, e.g. `ws://127.0.0.1:63877?tkn=...`).
- **Connection Lifecycle & Status:** Real-time visual status badge (Connecting, Connected, Disconnected, Reconnecting, Protocol Handshake Error).
- **Protocol Negotiation:** Handles protocol version negotiation (0.9.x through 1.x) during `initialize`.
- **State Reconnect & Replay:** Automatic reconnection using `reconnect` RPC with action sequence replay or state snapshot recovery (`AhpStateMirror`).

### 2.2 Session Management & Catalog
- **Session List Sidebar:**
  - Categorization into **Live / Active Sessions** (sessions actively running in a process or interactive terminal) and **Past / Disk Sessions**.
  - Real-time updates via `root/sessionAdded`, `root/sessionRemoved`, and `session/chatUpdated`.
  - Session metadata display: Title, working directory, last modified timestamp, and active status badge.
  - Search and filter by session title, working directory, and active status.
- **Session Operations:**
  - **Create Session:** Modal dialog allowing directory selection, agent provider selection, initial model selection, and dynamic config parameters (`resolveSessionConfig`).
  - **Rename Session:** Inline or action-triggered title update (`session/titleChanged`), syncing with the agent host.
  - **Archive / Unarchive:** Mark sessions as archived (`session/isArchivedChanged`).
  - **Dispose Session:** Clean up empty/scratch sessions (`disposeSession`).

### 2.3 Conversational Timeline & Turns
- **Turn-based Architecture:** Every interaction is structured as a `Turn` containing an initiating `Message` and an array of `ResponsePart` objects.
- **User Turn Display:**
  - User prompt text with markdown rendering.
  - Selected model and thinking configuration badge.
  - Attached resources (files, selections, symbols).
- **Assistant Streaming & Response Parts:**
  - **Markdown Text:** Streaming text token rendering with syntax highlighting, copy blocks, and line numbering.
  - **Reasoning / Thinking Parts:** Dedicated collapsible accordion displaying model chain-of-thought, live elapsed duration timer, and token consumption.
  - **Tool Calls:**
    - Tool identifier, call ID, and formatted parameter payload.
    - Lifecycle status: `streaming`, `pending-confirmation`, `running`, `completed`, `cancelled`, `auth-required`.
    - **Interactive Tool Approvals:** When a tool call requires user consent (`pending-confirmation`), present Accept / Reject / Always Allow options, dispatching `chat/toolCallConfirmed`.
    - Tool results display: plain text output, structured data, file diffs (`FileEdit`), or terminal output links.
  - **Input Requests / Elicitations (`ChatInputRequest`):**
    - Forms presented inside the stream for agent-requested user input (Text, Number, Boolean, Single-Select, Multi-Select).
    - Syncing draft answers via `chat/inputAnswerChanged` and submitting via `chat/inputCompleted`.
  - **System Notifications:** Informational events (e.g. background task completion, subagent notifications) styled distinctively from model messages.
  - **Resumable Errors:** Mid-turn failures (e.g., model provider timeouts or malformed tool arguments) render an actionable error banner with a "Resume Turn" button (`chat/turnResume`).
  - **Turn Metrics:** Token usage (prompt tokens, completion tokens, cached tokens) and execution duration.

### 2.4 Prompt Composer & Execution Controls
- **Smart Textarea:** Autosizing input with multiline support (`Shift+Enter` for newline, `Enter` to send).
- **Slash Commands Autocomplete (`/`):** Triggered on typing `/` at the start of input; invokes the `completions` RPC on the host to list available skills, prompt templates, and commands (e.g., `/ahp`, `/commit`, `/review`).
- **In-flight Turn Controls:**
  - **Abort / Stop:** Immediate turn cancellation (`chat/turnCancelled`) displayed prominently while a turn is active.
  - **Steering Messages:** Ability to submit guidance *while* a turn is running (`chat/pendingMessageSet` with `kind: steering`) to steer the model without aborting.
  - **Queued Messages:** Ability to queue follow-up prompts (`kind: queued`) that execute sequentially once the active turn completes.
  - **Queue Drawer / Manager:** Visual list of queued messages with drag-to-reorder (`chat/queuedMessagesReordered`) and delete capabilities (`chat/pendingMessageRemoved`).
- **Draft Synchronization:** Debounced saving of user input draft via `chat/draftChanged`.

### 2.5 Integrated Tooling & Auxiliary Views
- **Interactive Terminals:** Full terminal emulator (xterm.js) embedded in a slide-over or tab panel, communicating with `ahp-terminal:` channels via `createTerminal` / `disposeTerminal` and bidirectional stream dispatch.
- **Skills & Customizations Browser:** Inspector panel listing all skills, MCP servers, and prompt templates advertised by the agent host on `RootState` and `SessionState`.
- **Changeset & Diff Viewer:** Visual review of modified files and unified diffs generated during turns.

---

## 3. Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Browser (Client-Side)                           │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    UI View Layer (Vite + React)                  │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐  │  │
│  │  │ Host Selector│ │ Session List │ │ Chat Timeline & Composer │  │  │
│  │  └──────┬───────┘ └──────┬───────┘ └────────────┬─────────────┘  │  │
│  └─────────┼────────────────┼──────────────────────┼────────────────┘  │
│            ▼                ▼                      ▼                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     App Store / State Mirror                     │  │
│  │    • MultiHostClient / AhpClient                                 │  │
│  │    • AhpStateMirror (RootState, SessionState, ChatState)         │  │
│  │    • LocalStorage Settings (Host URLs, tokens, active host)      │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     ▼                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │       @microsoft/agent-host-protocol Client & WebSocket          │  │
│  │    • WebSocketTransport                                          │  │
│  │    • JSON-RPC 2.0 Framing & Protocol Negotiation                 │  │
│  │    • Subscription Manager (ahp-root://, ahp-session:, ahp-chat:) │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      │ WebSocket (JSON-RPC 2.0)
                                      ▼
             ┌─────────────────────────────────────────────────┐
             │            Agent Host Protocol Server           │
             │   (e.g., pi-agent-host-protocol / ws listener)  │
             └─────────────────────────────────────────────────┘
```

### 3.1 Direct Browser WebSocket Transport
The browser establishes direct WebSocket connections:
```ts
import { WebSocketTransport } from '@microsoft/agent-host-protocol/ws';
import { AhpClient, AhpStateMirror } from '@microsoft/agent-host-protocol/client';

const transport = await WebSocketTransport.connect(hostUrl);
const client = new AhpClient(transport);
client.connect();

const initResult = await client.initialize({
  clientId: 'ahp-web-ui-' + crypto.randomUUID().slice(0, 8),
  protocolVersions: ['1.0.0', '0.9.0'],
  initialSubscriptions: ['ahp-root://'],
});
```

### 3.2 State Synchronization & Mirroring
The UI leverages `AhpStateMirror` to maintain an authoritative, reactive local replica of the host state:
1. `ahp-root://`: Provides `agents`, `terminals`, `activeSessions`, `config`.
2. `ahp-session:/{sessionId}`: Provides session properties, `chats`, `workingDirectories`, `customizations` (skills, prompt templates).
3. `ahp-chat:/{chatId}`: Provides conversation history (`turns`), current in-flight turn (`activeTurn`), `steeringMessage`, `queuedMessages`, and `draft`.
4. `ahp-terminal:/{terminalId}`: Provides terminal metadata and stream data.

### 3.3 Storage & Persistence
- **Host Registry:** Stored in `window.localStorage` (Host Name, WebSocket URL, Auth Token, Last Connected).
- **Client Preferences:** Active host ID, active session ID, UI layout preferences (sidebar collapsed, theme settings).

---

## 4. UI Layout & Component Specifications

The layout conforms to a modern three-column / docked IDE aesthetic:

```
+-----------------------------------------------------------------------------------------+
| [Header] Logo | Host: [Local Host (ws://127.0.0.1:63877) v] [● Connected]  [+ New Session] |
+------------------+----------------------------------------------------+------------------+
| SESSIONS         | CHAT: "Refactor database migrations"               | DETAILS / TOOLS  |
| ---------------- | -------------------------------------------------- | ---------------- |
| [Search sessions]| Working Dir: /workspace/project                    | [Skills (4)]     |
|                  | Model: anthropic/claude-3-7-sonnet (High Thinking) | [Terminals (1)]  |
| > Live (2)       | -------------------------------------------------- | [Changes (2)]    |
|   • Migration... | [User Turn]                                        |                  |
|     (Active)     |   "Fix the schema migration script"                | Interactive pty  |
|   • TUI Session  |                                                    | terminal output  |
|                  | [Assistant Turn]                                   | or diff preview  |
| v Past (14)      |   v Thinking (4.2s)                                |                  |
|   • Add tests    |   Tool: run_command `npm test` [Success]           |                  |
|   • Lint fixes   |   I have resolved the schema migration issue...    |                  |
|                  | -------------------------------------------------- |                  |
|                  | [Prompt Input: Type your message or / for skills]  |                  |
|                  | [● Steering] [Queue] [Model Picker]      [Send / ■]|                  |
+------------------+----------------------------------------------------+------------------+
```

### 4.1 Header Bar
- **Brand Title & Logo:** Agent Host Protocol UI (`AHP UI`).
- **Host Switcher Dropdown:**
  - Displays currently selected host with status dot (`green` = connected, `amber` = connecting/reconnecting, `red` = disconnected).
  - Quick action: "Add Host..." modal (Name, URL with token parameter).
- **Global Actions:**
  - "New Session" button.
  - Connection retry button when disconnected.
  - Theme toggle (Dark / Light, defaulting to Dark).

### 4.2 Sidebar: Sessions Explorer
- **Search & Filter:** Instant text filtering over titles, session IDs, and working directory paths.
- **Section 1: Active / Live Sessions:**
  - Live TUI sessions bridged from terminal `pi` processes or currently active RPC sessions.
  - Pulsing indicator for actively generating turns.
- **Section 2: Saved / Recent Sessions:**
  - Paginated list populated via `listSessions`.
  - Display of relative time (e.g., "5m ago", "Yesterday").
- **Session Item Context Menu / Actions:**
  - Rename session (`session/titleChanged`).
  - Archive / Unarchive (`session/isArchivedChanged`).
  - Delete / Dispose (`disposeSession`).

### 4.3 Center Panel: Chat Timeline
- **Session Header Banner:**
  - Editable Session Title.
  - Working directory chip with folder icon.
  - Model & Thinking Level selector dropdown.
  - Active turn status indicator (Idle, Generating, Awaiting Approval, Error).
- **Timeline Items:**
  - **User Message:** Clean bubble with user avatar, timestamp, model badge, and any attached files/ranges.
  - **Thinking / Reasoning Accordion:** Collapsible drawer with discreet purple/indigo styling showing real-time token generation and thinking duration.
  - **Tool Calls:**
    - Tool badge with name (e.g. `run_command`, `read_file`, `write_to_file`).
    - Collapsible JSON parameters view.
    - Status pill (`Streaming`, `Running`, `Success`, `Failed`, `Waiting Approval`).
    - Tool Confirmation Bar (when required): "This tool requires permission to execute" with [Approve] and [Deny] buttons.
    - Result Viewer: Syntax highlighted output, error details, or file change summary.
  - **Input Requests (`ChatInputRequest`):**
    - Rendered interactive questionnaires for agent elicitations.
    - Form fields (text inputs, numbers, checkboxes, single/multi select radio groups).
    - [Submit Answers] and [Skip] action triggers.
  - **Resumable Error Banner:**
    - When a model server fails mid-turn with `resumable: true`, render a yellow/red warning banner with explanation and a "Resume Turn" action button (`chat/turnResume`).

### 4.4 Chat Composer & Control Center
- **Textarea:** Expandable text editor with markdown/code syntax convenience.
- **Completions Popup:**
  - Triggered by `/` at position 0.
  - Shows skills, prompt templates, and host commands fetched via `completions`.
  - Keyboard navigation (`Up`, `Down`, `Enter`, `Escape`).
- **Control Bar:**
  - **Model Selector:** Quick switch for provider/model and reasoning effort.
  - **Steering Toggle / Mode:** Allows sending a steering prompt during an ongoing turn (`chat/pendingMessageSet`).
  - **Queued Messages Counter & Drawer:** Displays badges for queued messages; opens drawer to reorder or cancel queued items.
  - **Action Button:**
    - State A (Idle): "Send" button (`chat/turnStarted`).
    - State B (Streaming): "Stop" button (`chat/turnCancelled`).

### 4.5 Auxiliary Inspector Panel (Tabs)
- **Skills & Customizations Tab:** Inspect active skills loaded for the session, prompt templates, and available tools.
- **Terminals Tab:** Integrated `xterm.js` terminal connected to host ptys (`ahp-terminal:` channels).
- **File Changes Tab:** List of modified files from `ChangesSummary` with click-to-view diffs.

---

## 5. Technology Stack & Tools

1. **Framework:** Vite + React 19 + TypeScript.
2. **Protocol SDK:** `@microsoft/agent-host-protocol` (`^1.0.0`) for types, client, reducers, and WebSocket transport.
3. **Styling:** Vanilla CSS design system with CSS custom properties (CSS variables) for modern dark/light themes, smooth transitions, and glassmorphism accents.
4. **Terminal Emulator:** `@xterm/xterm` + `@xterm/addon-fit` for interactive terminal sessions.
5. **Markdown & Code Rendering:** Lightweight, secure markdown parser with syntax highlighting.
6. **Code Quality & Build:** Biome (`@biomejs/biome`) for formatting and linting; `just` for workflow automation.
7. **Testing:** Node.js test runner (`node:test`) or Vitest for unit testing client state handling and reducers.

---

## 6. Implementation Milestones

- **Milestone 1: Project Setup & Protocol Connectivity**
  - Setup Vite, TypeScript, Biome, and `justfile`.
  - Install `@microsoft/agent-host-protocol`.
  - Implement connection manager (localStorage persistence, connect, reconnect, status reflection).
  - Implement `ahp-root://` subscription and `listSessions` fetch.

- **Milestone 2: Session Explorer & Creation**
  - Render sidebar with live and archived sessions.
  - Implement session creation dialog with working directory and model resolution.
  - Implement session renaming and disposal.

- **Milestone 3: Chat Timeline & Message Streaming**
  - Subscribe to `ahp-session:/{id}` and `ahp-chat:/{id}`.
  - Render conversation turns: User messages, assistant text streaming, thinking/reasoning blocks.
  - Render tool calls, execution statuses, and tool results.
  - Handle mid-turn errors and resumable turns (`chat/turnResume`).

- **Milestone 4: Interactive Input, Steering & Queueing**
  - Implement smart input box with `/` slash command completions for skills and templates.
  - Support aborting/cancelling active turns.
  - Support in-flight steering messages.
  - Support queued messages with reordering and removal.
  - Render input request forms (`ChatInputRequest`) and dispatch responses.

- **Milestone 5: Tool Approvals & Embedded Terminals**
  - Implement tool call confirmation UI (`chat/toolCallConfirmed`).
  - Implement xterm.js integration for `ahp-terminal:` channels.
  - Polish layout, theme tokens, animations, and responsive behavior.
