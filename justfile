# Format and apply safe lint fixes.
fix:
    npx @biomejs/biome check --write .

# Lint and check formatting.
lint:
    npx @biomejs/biome check .

# Everything CI runs.
ci: lint
