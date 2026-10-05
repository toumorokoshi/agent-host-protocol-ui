# GAPS & Implementation Roadmap

This document tracks identified gaps, planned milestones, and completed features for `agent-host-protocol-ui`.

---

## 1. Core Protocol & Client Plumbing
- [x] **Package & Tooling Initialization:** Initialized Vite + React 19 + TypeScript application workspace, configured `@microsoft/agent-host-protocol`, Biome, and `justfile`.
- [x] **Connection Manager:** Implemented `AhpConnection` with WebSocket URL sanitization, protocol negotiation, and connection lifecycle management.
- [x] **Automatic Mode Transition:** Automatically switches from demo mode to live mode upon entering host credentials and clearing simulated sessions.
- [x] **Client Vault:** Implemented `CryptoVault` using Web Crypto API AES-GCM-256 with Ephemeral (zero-knowledge) and Passphrase (PBKDF2-HMAC-SHA-256) modes.

## 2. Session Navigation & Explorer (Sidebar)
- [x] **Session Catalog:** Real remote session listing with search filter, active session selection, and modified timestamps.
- [x] **Live Session Indicators:** Visual distinction for live bridged TUI sessions with pulsing status badges.
- [x] **Remote Host Data in New Session Modal:** Dynamically populates working directory from remote host's `defaultDirectory` and models from `rootState.agents`.
- [x] **Session Actions:** Rename session with inline prompt and dispose empty/unwanted sessions via remote `disposeSession` RPC.

## 3. Conversational Timeline & Streaming
- [x] **Turn Timeline:** Completed turns and active streaming turn rendering.
- [x] **Live Stream Integration:** Subscribes to `ahp-chat:/${id}` streaming actions (`chat/turnStarted`, `chat/textDelta`, `chat/reasoning`, `chat/toolCallStart`, `chat/toolCallDelta`, `chat/turnComplete`).
- [x] **Markdown Renderer:** Secure streaming markdown parser with DOMPurify AST sanitization, syntax highlighting, and code block formatting.
- [x] **Reasoning Stream Accordion:** Dedicated collapsible section for chain-of-thought with elapsed duration timer and token stats.
- [x] **Tool Call Component:**
  - Status indicator (`streaming`, `running`, `completed`, `cancelled`).
  - Formatted parameter viewer.
  - Interactive permission approval bar (`Approve` / `Deny`).
  - Output and result display.
- [x] **Resumable Errors:** Resumable turn error handling with one-click "Resume Turn" action.
- [ ] **Interactive Input Elicitations Form:** Full multi-page form controls for `ChatInputRequest` question types.

## 4. Composer, Steering & Queueing
- [x] **Composer Input:** Autosizing multiline textarea with `Enter` to submit and `Shift+Enter` for newline.
- [x] **Private Drafting by Default:** Keystrokes buffered strictly in local memory; unsolicited draft broadcasts disabled.
- [x] **Slash Command Autocomplete:** Popover triggered by `/` completing skills, commands, and prompt templates (querying remote `completions` RPC in live mode).
- [x] **Turn Execution Controls:** Prominent Stop / Abort button dispatching `chat/turnCancelled`.
- [x] **Steering Messages:** In-flight steering toggle to adjust direction mid-turn without aborting via `chat/pendingMessageSet`.
- [x] **Queued Messages Manager:** Enqueue follow-up prompts, view queue, and remove items from queue.

## 5. Security, Privacy & Encryption
- [x] **Web Crypto AES-GCM Encrypted Storage:** Client-side encrypted storage architecture for host credentials and cached data.
- [x] **Key Management & Modes:** Support Ephemeral session key mode (zero-knowledge, cleared on tab close), Passphrase vault (PBKDF2-HMAC-SHA-256), and Memory-Only mode.
- [x] **Token Sanitizer:** Mask host connection tokens (`tkn=...`) from visible UI displays.
- [x] **Browser Password Manager & Credential Management API Support:** Standardized form semantic attributes (`autocomplete="username"`, `autocomplete="current-password"`), smart URL query parameter decomposition, and `navigator.credentials.store` / `navigator.credentials.get` integration for Chrome, Safari Keychain, and 1Password.
- [x] **DOMPurify Sanitization Pipeline:** AST-based HTML and markdown sanitization blocking script tags, dangerous URI schemes, and inline handlers.
- [ ] **Strict Content Security Policy (CSP) Headers:** Production deployment CSP headers configuration.

## 6. Auxiliary Tools & Extensions
- [x] **Skills & Customizations Inspector:** Sidebar tab inspecting session customizations, MCP server configs, and loaded skills.
- [ ] **Embedded Terminal Emulator:** Integrate `xterm.js` connecting to `ahp-terminal:` channels via `createTerminal` / `disposeTerminal`.
- [ ] **Changeset & Diff Viewer:** Visual review of modified files and unified diffs generated during turns.

## 7. Visual Aesthetics & Theme System
- [x] **Dark Mode by Default with System Color Scheme Detection:** Defaults to dark mode while automatically adapting to the user's OS light/dark scheme when available via `prefers-color-scheme`.
- [x] **Dynamic Theme Switching:** Live media query listener updating dynamically on OS appearance changes, along with manual overrides (Auto / Light / Dark) in the Header.
- [x] **VS Code Dark+ Palette & Contrast Optimization:** Standardized dark palette to standard VS Code Dark+ (`#1e1e1e` editor canvas, `#252526` sidebar) with high-contrast `#4fc1ff` cyan tool names and command identifiers meeting WCAG AAA.
- [ ] **Custom Theme Accents:** User-customizable accent colors and IDE syntax highlighting themes.

