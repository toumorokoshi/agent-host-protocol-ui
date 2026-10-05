## ALWAYS RUN

Important: this list is separate from any others in the prompt. Follow this
order of operations.

1. study the README.md
2. grep `specs/` for any relevant keywords to the task you are implementing.
3. study the relevant specs.
4. grep `design/` for any relevant keywords to the task you are implementing.
5. study the relevant documents.
6. implement the change requested in the prompt.
7. run linting and formatting before committing.
8. Identify any remaining issues or features that need to be implemented
   2. include them in GAPS.md

## Branch cleanup

When starting work, the branch should be clean, and you should try pull the
latest changes from the primary upstream branch before continuing.

## Add and update documentation

Always add and update documentation as appropriate. Update at least the following:

- any relevant files in the `docs/` directory.
- any updated designs and considerations in the `specs/` directory.

## Committing code

- **unless** the prompt contains "don't commit", commit the code.
- **unless** the prompt contains "don't push", push the code.

- Use the conventional commit format for commit messages.
- The commit description must explain the problem first.
- The commit description must a summary of each area modified.

## Linting

- Always run linting and formatting before committing.
- Formatting and lint fixing tools are available via `just fix`.
- Linting tools are available via `just lint`.

## Testing

- linting, formatting, and testing **must** pass before a commit.
- add unit tests for every change if possible.

## CI

CI **must** pass after every commit.

To verify CI status, use the GitHub MCP server.

## Code Design

The following code tenants are followed:

- functional programming as much as possible.
- separate state from functional programming.
- re-use code as much as possible.
- leverage best-practice third party libraries.

## Type Safety & Casting Guidelines

To prevent silent runtime bugs and maintain compiler guarantees:

- **Strictly prohibit double casting (`as unknown as T`):** Never use `as unknown as T` to force an object into an incompatible type. Double casting silences TypeScript's structural checks and hides object hierarchy bugs (such as expecting properties of an inner payload directly on an outer wrapper, e.g., `result.turns` instead of `result.snapshot?.state.turns`).
- **Narrow inner payloads, never outer envelopes:** In protocol SDKs with generic envelopes (such as `SubscribeResult` containing `snapshot?: Snapshot` where `Snapshot.state` is `unknown`), cast or narrow only the *inner payload* (`snapshot?.state as ChatState | undefined`), never the outer response.
- **Rely on discriminated unions:** Use TypeScript's native narrowing (e.g. `switch (part.kind)`) rather than casting union variants. When the union is checked, TypeScript automatically narrows fields like `part.content` without any casts.
- **Avoid `as any`:** Never use `as any` to silence compiler warnings. Use proper interface definitions, type guards, or global declaration augmentations (e.g. `declare global { interface Window ... }`).
- **Mandate optional chaining for optional state:** Always use optional chaining (`?.`) when accessing fields on state snapshots or API payloads to ensure absent properties at runtime fail gracefully rather than throwing or producing silent bugs.

## Examples

- example data is in the `examples/` directory.