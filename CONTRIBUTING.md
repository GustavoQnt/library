# Contributing

Thanks for contributing to this project.

## Project Type
This is a TypeScript monorepo using `pnpm` workspaces (not .NET).

## Prerequisites
- Node.js `>=18` (Node 20+ recommended)
- `pnpm` (via Corepack recommended)

## Setup
1. Fork and clone the repository.
2. Install dependencies:
   ```bash
   pnpm install
   ```

## Local Checks
Run these before opening a PR:

1. Tests:
   ```bash
   pnpm test
   ```
2. Typecheck:
   ```bash
   pnpm typecheck
   ```
3. Build:
   ```bash
   pnpm build
   ```
4. Benchmarks (optional, for performance changes):
   ```bash
   pnpm bench
   ```

## Pull Requests
1. Create a branch from `main`.
2. Keep PRs focused and small.
3. Add or update tests for behavior changes.
4. Update docs when API or behavior changes.
5. Explain what changed and why in the PR description.

## Commit Messages
- Use clear, concise commit messages.
- Reference issues when relevant.

## Reporting Bugs
Open an issue with:
- Reproduction steps
- Expected vs actual behavior
- Node version and OS

## Security
Do not report vulnerabilities in public issues.
Follow `SECURITY.md` for private reporting.
