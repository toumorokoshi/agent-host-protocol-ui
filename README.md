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
  - Seamless non-terminating session switching: in-flight turns keep running in the background with live streaming updates and visual sidebar status indicators.

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
- 🔒 **User Privacy & Zero-Knowledge Security:**
  - **Private Composer Drafting:** Keystrokes and drafts remain strictly in local browser memory; no uncommitted text is broadcast over the network by default.
  - **Client-Side Encryption at Rest:** Persistent state (host configurations, credentials, cached sessions) is encrypted using **Web Crypto API AES-GCM-256** with PBKDF2 key derivation or zero-knowledge ephemeral session keys.
  - **100% Air-Gapped / Zero External Requests:** No third-party analytics, tracking, telemetry, or remote CDN dependencies.
  - **Defense-in-Depth XSS Sanitization:** Strict Content Security Policy (CSP) and DOMPurify sanitization preventing script injection from model or tool output.
  - **Token & Secret Masking:** Host connection tokens and elicitation passwords masked in UI and isolated in memory.

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

### Run via npx (Zero Setup)

Launch the UI directly in your browser without cloning or installing:

```sh
npx @toumorokoshi/agent-host-protocol-ui
```

#### CLI Options & External Network Access

```sh
# Serve on all network interfaces (0.0.0.0) so it is accessible externally
npx @toumorokoshi/agent-host-protocol-ui --host 0.0.0.0
# or:
npx @toumorokoshi/agent-host-protocol-ui --bind 0.0.0.0

# Pre-configure your local or remote agent host connection
npx @toumorokoshi/agent-host-protocol-ui --agent-host "ws://127.0.0.1:63877?tkn=your-token"

# Specify a custom port
npx @toumorokoshi/agent-host-protocol-ui --port 3000

# Run headless without opening local browser (e.g. in remote VM or container)
npx @toumorokoshi/agent-host-protocol-ui --bind 0.0.0.0 --port 8080 --no-open
```

> [!TIP]
> **Connecting from another device (LAN / Mobile / Plain HTTP):**
> 1. By default, AHP servers (like `pi-agent-host-protocol`) bind only to loopback (`127.0.0.1`). When accessing the UI from another device over your network, make sure to start your AHP server on all interfaces:
>    ```sh
>    pi-agent-host-protocol --host 0.0.0.0
>    ```
> 2. `agent-host-protocol-ui` automatically derives its default WebSocket host from `window.location.hostname` (e.g. `ws://192.168.1.50:63877`), ensuring remote devices connect to your workstation rather than their own loopback (`127.0.0.1`).
> 3. If launching the CLI with `--host 0.0.0.0` and `--agent-host`, the CLI automatically rewrites `127.0.0.1` to each network interface IP in the printed Network URLs for seamless QR-code / mobile opening.
>
> **Tailscale (`*.ts.net`) & HTTPS Mixed Content Notice:**
> When opening the UI over HTTPS (such as `https://<node>.ts.net` via Tailscale Serve or Tailscale HTTPS), modern browsers block unencrypted `ws://` connections (*"Failed to construct 'WebSocket': An insecure WebSocket connection may not be initiated from a page loaded over HTTPS"*).
>
> To connect successfully with Tailscale:
> - **Option 1 (Recommended / Zero-Config):** Access the UI over plain HTTP using your Tailscale IP (e.g. `http://100.x.y.z:5173`) instead of your `https://*.ts.net` MagicDNS domain. Over HTTP, unencrypted `ws://` connections (`ws://100.x.y.z:63877`) are fully permitted, and Tailscale WireGuard encrypts all traffic end-to-end at the network layer.
> - **Option 2 (CLI Proxy):** When using the CLI runner with Tailscale Serve on port 5173, the CLI automatically reverse-proxies WebSocket upgrades on `/ws` to the agent host. Connect to `wss://<node>.ts.net/ws`.
> - **Option 3 (Tailscale Serve TLS Proxy):** Proxy the agent host with TLS via Tailscale Serve:
>   ```sh
>   tailscale serve --bg https:8443 / http://127.0.0.1:63877
>   ```
>   Then connect in the UI using `wss://<node>.ts.net:8443`.

---

### Install from Source

You can build and install the standalone CLI globally from source:

#### Option A: From a cloned local repository

```sh
git clone https://github.com/toumorokoshi/agent-host-protocol-ui.git
cd agent-host-protocol-ui
npm install
npm run build
npm link
# or install globally:
npm install -g .
```

Now you can invoke the CLI from any directory:
```sh
agent-host-protocol-ui
# or with flags:
agent-host-protocol-ui --host 0.0.0.0
```

#### Option B: Directly from GitHub via npm / npx

```sh
# Run on-demand without manual cloning:
npx github:toumorokoshi/agent-host-protocol-ui

# Or install globally directly from GitHub:
npm install -g github:toumorokoshi/agent-host-protocol-ui
```

---

### Local Development

#### Prerequisites
- Node.js 22 or later
- npm or pnpm

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
- [Security & Privacy Architecture](docs/security.md)
- [Gaps & Implementation Roadmap](GAPS.md)
- [License (Apache-2.0)](LICENSE)
