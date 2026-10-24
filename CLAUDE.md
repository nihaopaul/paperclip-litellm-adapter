# CLAUDE.md

## Development location — always use a local worktree

The canonical source lives on the NFS share, but **never run `pnpm install`,
`pnpm build`, or `pnpm test` on the NFS checkout** — `node_modules` is slow on
NFS and must never be created there.

Always do development work in a **git worktree on a local (non-NFS) disk**:

```sh
git worktree add -b dev /home/nihaopaul/paperclip-litellm-adapter main
cd /home/nihaopaul/paperclip-litellm-adapter
corepack pnpm@9.15.4 install
```

Rules:

- `node_modules/` and `dist/` are gitignored and belong **only** in the local worktree.
- The NFS checkout stays clean (source only) for browsing.
- Push from the local worktree; `main` is merged/reviewed from there.
