# Security & Privacy Architecture

`agent-host-protocol-ui` is designed from the ground up to protect user privacy, sensitive prompts, proprietary codebases, and credentials. This document details the threat model, privacy guarantees, cryptographic controls, and security best practices implemented in the application.

---

## 1. Threat Model & Security Objectives

When interacting with AI coding agents, developers frequently input:
- Proprietary source code and architecture diagrams.
- Sensitive environment configurations, API keys, and connection credentials.
- Strategic business prompts and instructions.

### Threat Vectors Mitigated

| Threat Vector | Description | Mitigation Strategy |
|---|---|---|
| **Local Storage Snooping** | Shared machines, malware, or rogue browser extensions accessing unencrypted `localStorage`. | Web Crypto API AES-GCM-256 encryption at rest with PBKDF2 key derivation or ephemeral in-memory keys. |
| **Network Eavesdropping / MITM** | Interception of WebSocket traffic between browser and agent host. | Enforced TLS/WSS for non-loopback connections; strict mixed-content enforcement. |
| **Unsolicited Keystroke Leaks** | Draft messages being streamed to servers or other clients before user sends them. | Private Drafting Mode by default; zero transmission of uncommitted composer text. |
| **Third-Party Data Exfiltration** | Third-party analytics, tracking scripts, or CDN font fetches logging user interactions. | 100% self-contained application with zero third-party scripts, telemetry, or external network requests. |
| **Cross-Site Scripting (XSS)** | Malicious or hallucinated agent output injecting scripts into the UI DOM. | Strict DOMPurify AST sanitization with allowlist + defense-in-depth Content Security Policy (CSP). |
| **Credential & Token Exposure** | Token query parameters (`?tkn=...`) leaking via browser history, referrers, or logs. | Token scrubbing from address bar and UI views; isolated in-memory credential vault. |
| **Unintended Destructive Execution** | Agent executing destructive shell or filesystem commands without user knowledge. | Explicit interactive tool approval dialogs (`chat/toolCallConfirmed`) with param inspection. |

---

## 2. Client-Side Encryption at Rest

To guarantee that no user data is stored in plain text on the user's filesystem or browser profile, the application provides an encrypted storage layer powered by the standard **Web Crypto API** (`crypto.subtle`).

### Cryptographic Primitives

- **Cipher:** AES-GCM (Galois/Counter Mode) with 256-bit keys and 96-bit unique IVs (Initialization Vectors) generated per encryption operation via `crypto.getRandomValues()`.
- **Key Derivation Function (KDF):** PBKDF2-HMAC-SHA-256 with 600,000 iterations and a unique 128-bit cryptographic salt.
- **Integrity & Authenticity:** Built-in 128-bit GMAC authentication tags ensure stored records cannot be modified without detection.

### Storage Modes

Users can select their preferred privacy mode:

1. **Ephemeral (Zero-Knowledge) Mode (Default):**
   - An ephemeral 256-bit AES key is generated on launch using `crypto.subtle.generateKey()` (AES-GCM-256, non-extractable).
   - The key is retained only in browser memory (`sessionStorage` or runtime variables) and is never written to disk.
   - Any temporary cached data in `localStorage` or `IndexedDB` is encrypted with this ephemeral key.
   - Once the browser tab or session is closed, the key is permanently destroyed, rendering any cached data indecipherable.

2. **Passphrase-Protected Vault:**
   - The user defines a master passphrase upon first launch.
   - The key is derived via PBKDF2.
   - When the user returns, entering the passphrase unlocks the local registry and cached session history.
   - Passphrases and derived keys are never transmitted over the network.

3. **Memory-Only Mode (Zero Disk Persistence):**
   - Completely disables browser storage (`localStorage` and `IndexedDB`).
   - All session state, host configurations, and history reside strictly in JavaScript memory and vanish on tab close.

### Secure Context Requirements

Browsers expose the full Web Crypto API (`crypto.subtle`) and `crypto.randomUUID()` **only in secure contexts** (HTTPS or `localhost`). When the UI is served over plain HTTP on a network (e.g., LAN / mobile device testing):

- The vault **degrades to Memory-Only mode** at init time with a console warning — the app remains fully functional, but encrypted persistence is unavailable in that context.
- UUID generation falls back to `crypto.getRandomValues()` (available in all contexts) to assemble spec-compliant v4 UUIDs for client IDs, session URIs, and turn IDs.

Use `localhost` or HTTPS to re-enable encrypted-at-rest storage and native `crypto.randomUUID()`.

---

## 3. Privacy Guarantees for User Inputs

### Private Composer Drafting
In the Agent Host Protocol, hosts support `chat/draftChanged` to sync what the user is typing in real time. While useful in some multi-user environments, this can expose half-formed thoughts, credentials typed and deleted, or proprietary code pasted into the composer.

- In `agent-host-protocol-ui`, **Private Drafting** is enabled by default.
- Keystrokes are buffered strictly within the local component state.
- No network messages are dispatched until the user presses **Send** or uses keyboard shortcuts to submit the turn (`chat/turnStarted`).
- Broadcasting drafts over the wire requires explicit user opt-in.

### Sensitive Input Masking
When an agent or tool initiates an elicitation questionnaire (`ChatInputRequest`) requesting credentials, passwords, or tokens:
- Input elements default to password-type masked fields.
- Masked values are excluded from plain-text state snapshots and clipboard auto-sharing.

---

## 4. Network Security & Air-Gap Compliance

### Pure Client-Side Architecture
- The application executes entirely on the client side.
- No intermediary proxy, backend server, or analytics collection is present.
- Every WebSocket connection is established directly between the browser and the target AHP host specified by the user.

### Transport Security Rules
- **Loopback Connections (`127.0.0.1`, `localhost`, `[::1]`):** Plaintext `ws://` is permitted exclusively for local loopback development.
- **Remote Hosts:** Any remote IP or hostname **must** use secure WebSockets (`wss://`).
- **Mixed-Content Protection:** When the UI is served over HTTPS, the browser automatically blocks unencrypted `ws://` connections to remote hosts.

### Token Sanitization
AHP daemon connections often include token parameters, such as:
```
ws://127.0.0.1:63877?tkn=abc123xyz
```
The UI immediately isolates the `tkn` parameter into the encrypted credential vault. The header chrome never renders the raw connection string — only a connection status dot on the settings (cog) icon — so the token is never exposed in the UI. The full URL (with the token field masked by default) is visible only inside the host configuration modal:
```
ws://127.0.0.1:63877 [Token Secured]
```

---

## 5. Content Security Policy & Sanitization

Because the UI renders complex agent outputs, markdown tables, code diffs, and tool responses, robust defenses against Cross-Site Scripting (XSS) are enforced.

### Content Security Policy (CSP)
```http
default-src 'none';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self' ws: wss:;
frame-ancestors 'none';
form-action 'none';
base-uri 'none';
```

### DOMPurify HTML Sanitization
All markdown rendering passes through DOMPurify configured with an aggressive allowlist:
- Disallows all `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, and `<base>` tags.
- Strips all inline event handlers (`onclick`, `onerror`, `onload`).
- Strips dangerous URL schemes (`javascript:`, `vbscript:`, `data:text/html`).

---

## 6. Tool Execution Guardrails

When agents request sensitive system operations:
- If a tool call has `ToolCallStatus.PendingConfirmation`, execution is halted until the user explicitly reviews the tool parameters and clicks **Approve**.
- The approval interface displays full JSON arguments, target paths, and commands in a formatted viewer so the user has complete visibility before authorization.
- Users can reject tool calls with optional feedback to steer the model safely.

---

## 7. Browser Password Manager & Credential Management API

Because AHP daemons authenticate connections using connection tokens (e.g. `ws://127.0.0.1:63877?tkn=...`), browser password managers (Chrome Password Manager, Firefox, Safari/Keychain, 1Password, Bitwarden) naturally treat the host configuration dialog as an authentication pair:

- **Username / Host Identity:** The WebSocket URL (or host identifier) via `<input type="text" name="username" autocomplete="username" />`.
- **Password / Connection Token:** The host authentication token via `<input type="password" name="password" autocomplete="current-password" />`.

### Security Advantages
1. **OS-Level Keychain Storage:** Browser password managers store tokens in the operating system's hardware-backed encrypted keychain (e.g., Apple Keychain with Secure Enclave, Windows Hello / DPAPI), requiring biometric (Touch ID / Face ID) or master password authentication to access.
2. **Eliminates Plaintext Scraping:** Users do not need to store tokens in plaintext shell history, terminal logs, or unencrypted text files.
3. **Seamless Multi-Host Autofill:** Returning to a saved host automatically suggests and fills the connection URL and token with zero manual interaction.
4. **Smart URL Decomposition:** When users paste connection strings with query parameters (`ws://127.0.0.1:63877?tkn=...`), the UI automatically decouples the query token into the password field and cleans the username field to `ws://127.0.0.1:63877`. This allows Chrome to update existing credentials cleanly upon token rotation instead of creating fractured duplicate records.
5. **Credential Management API (`navigator.credentials`):** Where supported, the UI integrates with `navigator.credentials.store(new PasswordCredential(...))` and `navigator.credentials.get({ password: true })` to coordinate with the browser's native credential store upon successful WebSocket handshake.


