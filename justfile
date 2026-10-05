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

# Build the production bundle.
build:
    npm run build

# Everything CI runs.
ci: lint test

# Publish to npm.
publish: ci build
    npm publish --access public
