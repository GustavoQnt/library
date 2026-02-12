# Contributing

Thanks for your interest in contributing. This guide describes how to propose
changes and get them merged smoothly.

## Quick Start
1. Fork the repo and create a branch from `main`.
2. Make your changes with tests and documentation as needed.
3. Run tests locally.
4. Open a pull request (PR) with a clear description.

## Development Setup
This project is a .NET solution. Typical setup:
1. Install the .NET SDK (version listed in the repo if applicable).
2. Restore dependencies:
   - `dotnet restore`
3. Build:
   - `dotnet build`
4. Test:
   - `dotnet test`

## Branching and PRs
- Use short, descriptive branch names (e.g., `fix-api-timeout`).
- Keep PRs focused on a single topic.
- Update or add tests for any behavior change.
- If you change public behavior, update documentation as well.

## Commit Style
- Write clear, concise commit messages.
- If possible, reference relevant issues.

## Code Review
We review PRs for correctness, clarity, and maintainability. Please be ready to
iterate based on feedback.

## Reporting Bugs
Open an issue with:
- A concise title and description
- Steps to reproduce
- Expected vs actual behavior
- Environment details

## Security Issues
Do not open public issues for security vulnerabilities. See `SECURITY.md` for
reporting instructions.

