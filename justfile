# Format and apply safe lint fixes.
fix:
    npx @biomejs/biome check --write .

# Lint and check formatting.
lint:
    npx @biomejs/biome check .
    npm run typecheck

# Run unit tests.
test:
    node --test

# Everything CI runs.
ci: lint test
