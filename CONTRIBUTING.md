# Contributing

Thanks for helping with ganttkit. Bugs and feature requests go to [Issues](https://github.com/ktimur91/ganttkit/issues),
questions and ideas to [Discussions](https://github.com/ktimur91/ganttkit/discussions).

## Setup

Node 24 and pnpm 10.

```bash
pnpm install
pnpm dev        # playground on http://localhost:5280
pnpm test       # core tests
pnpm e2e        # browser tests, run `pnpm --filter playground exec playwright install` once
pnpm typecheck
```

## Where things live

- `packages/core`: the `ganttkit` npm package. Pure date, layout and link math plus `useGantt`. Changes here need tests in `packages/core/test`.
- `registry/gantt`: the copy-in components. After changing them run `pnpm registry:build` and commit `apps/playground/public/r`.
- `apps/playground`: the demo. Check your change there with 10 000 rows.

## Pull requests

- One logical change per pull request, with a short description of what and why.
- Commit messages in English, imperative mood: `Fix link path for SS links`.
- Keep the core free of DOM and styling assumptions, styling belongs to the components.
