# GAPS & Implementation Roadmap

This document tracks identified gaps, planned milestones, and remaining features for `agent-host-protocol-ui`.

---

## 1. Core Protocol & Client Plumbing
- [ ] **Package & Tooling Initialization:** Initialize Vite + React + TypeScript application workspace, configure `@microsoft/agent-host-protocol`, Biome, and `justfile`.
- [ ] **Connection Manager:** Implement `HostConnectionManager` storing configured hosts and authentication tokens in `localStorage`.
- [ ] **AHP Client Factory:** Wrap `WebSocketTransport` and `AhpClient` with error handling, auto-reconnection with exponential backoff, and protocol version handshake.
- [ ] **State Mirror Integration:** Integrate `AhpStateMirror` or reactive hooks for subscribing to `ahp-root://`, `ahp-session:/{id}`, and `ahp-chat:/{id}`.

## 2. Session Navigation & Explorer (Sidebar)
- [ ] **Session Catalog:** Implement session listing via `listSessions` RPC with pagination (`nextCursor`).
- [ ] **Live Session Indicators:** Distinguish bridged interactive TUI sessions (e.g. `pi` terminal sessions) from idle/saved sessions.
- [ ] **Session Creation Flow:** Interactive modal to create a new session, choose working directory, select agent provider, and pick model and reasoning effort.
- [ ] **Session Actions:** Implement rename session (`session/titleChanged`), archive toggle, and disposal of empty sessions (`disposeSession`).

## 3. Conversational Timeline & Streaming
- [ ] **Turn Timeline:** Render completed `turns` and live `activeTurn`.
- [ ] **Markdown Renderer:** Implement streaming markdown parser with syntax highlighting and code block copy buttons.
- [ ] **Reasoning Stream Accordion:** Dedicated collapsible section for reasoning/thinking parts with elapsed time counters and token stats.
- [ ] **Tool Call Component:**
  - Status indicator (`streaming`, `running`, `completed`, `cancelled`).
  - Parameter JSON viewer with formatted syntax highlighting.
  - Interactive permission approval bar (`chat/toolCallConfirmed`) when approval is required.
  - Output display (text, errors, file changes).
- [ ] **Input Request Elicitations:** Render forms for `ChatInputRequest` (text, numbers, booleans, single-select, multi-select) with `chat/inputCompleted` dispatch.
- [ ] **Resumable Errors:** Render error banner on resumable turn errors with "Resume Turn" action (`chat/turnResume`).

## 4. Composer, Steering & Queueing
- [ ] **Composer Input:** Autosizing textarea with keyboard shortcuts (`Enter` to submit, `Shift+Enter` for newline).
- [ ] **Private Drafting by Default:** Local buffering of uncommitted keystrokes; eliminate unsolicited `chat/draftChanged` leaks.
- [ ] **Slash Command Autocomplete:** Popover triggered by `/` querying `completions` RPC for skills and prompt templates.
- [ ] **Turn Execution Controls:** Prominent Stop / Abort button (`chat/turnCancelled`) during generation.
- [ ] **Steering Messages:** In-flight message submission (`chat/pendingMessageSet` with `kind: steering`).
- [ ] **Queued Messages Manager:** Drawer to view, reorder (`chat/queuedMessagesReordered`), and delete (`chat/pendingMessageRemoved`) queued messages.

## 5. Security, Privacy & Encryption
- [ ] **Web Crypto AES-GCM Encrypted Storage:** Implement client-side encrypted storage for host registry, connection tokens, and cached sessions.
- [ ] **Key Management & Modes:** Support Ephemeral session key mode (zero-knowledge, cleared on tab close), Passphrase vault (PBKDF2-HMAC-SHA-256), and Memory-Only mode.
- [ ] **Token Sanitizer:** Mask host connection tokens (`tkn=...`) from UI displays and address bar history.
- [ ] **DOMPurify Sanitization Pipeline:** AST-based HTML and markdown sanitization blocking script tags, dangerous URI schemes, and inline handlers.
- [ ] **Strict Content Security Policy (CSP):** Enforce CSP blocking any external network exfiltration (`connect-src 'self' ws: wss:`).
- [ ] **Sensitive Elicitation Masking:** Support masked input fields in `ChatInputRequest` for passwords and secrets.

## 6. Auxiliary Tools & Extensions
- [ ] **Embedded Terminal Emulator:** Integrate `xterm.js` connecting to `ahp-terminal:` channels via `createTerminal` / `disposeTerminal`.
- [ ] **Skills & Customizations Inspector:** View session customizations, MCP server configs, and loaded skills.
- [ ] **Changeset & Diff Viewer:** View modified files and visual diffs from changeset channels.
