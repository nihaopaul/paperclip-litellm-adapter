# @nihaopaul/paperclip-litellm-adapter

A [Paperclip](https://github.com/paperclipai/paperclip) **external adapter plugin** that runs coding-agent harnesses through a [LiteLLM](https://www.litellm.ai/) gateway, using the [Lite-Harness SDK](https://github.com/LiteLLM-Labs/lite-harness) (vendored — the SDK is not published to npm yet).

The user supplies a gateway URL + API key + model; the adapter spawns the Lite-Harness server, which drives the underlying harness with model calls routed through LiteLLM.

## Harnesses

| `harness` | what it drives | notes |
|---|---|---|
| `claude` | Claude Code (Claude Agent SDK) | reports usage + cost |
| `codex` | Codex (Codex SDK) | needs the Codex CLI on `PATH` |
| `pi` | Pi AI (in-process, OpenAI-compatible) | no external CLI |

## Install (as a Paperclip plugin)

Install the package into Paperclip's adapter plugin store:

```sh
mkdir -p ~/.paperclip/adapter-plugins/node_modules
cd ~/.paperclip/adapter-plugins/node_modules
npm install @nihaopaul/paperclip-litellm-adapter
```

Then register it in `~/.paperclip/adapter-plugins.json`:

```json
[
  {
    "packageName": "@nihaopaul/paperclip-litellm-adapter",
    "type": "lite_harness",
    "version": "0.2.0",
    "installedAt": "2026-10-25T00:00:00.000Z"
  }
]
```

On restart, Paperclip's plugin loader calls `createServerAdapter()` from the package's main entry and registers a `lite_harness` harness.

## Configuration

The harness exposes these `adapterConfig` fields:

| field | required | description |
|---|---|---|
| `gatewayBaseUrl` | yes | LiteLLM gateway URL, e.g. `http://192.168.2.47:14000` |
| `apiKey` | yes | LiteLLM virtual key |
| `model` | yes | LiteLLM model id, e.g. `deepseek-flash` |
| `harness` | yes | `claude` (default), `codex`, or `pi` |
| `cwd` | no | working directory |
| `timeoutSec` | no | run timeout in seconds (default 600) |

## How it works

`execute()` spawns the vendored Lite-Harness server:

```sh
node vendor/lite-harness-server/server.mjs \
  --input-format stream-json --output-format stream-json \
  --agent <harness> --model <model>
```

with `LITELLM_API_BASE` / `LITELLM_API_KEY` set from the config. The server speaks the Claude Agent SDK **stream-json** protocol (NDJSON), which is streamed through Paperclip's `onLog` and parsed into `AdapterExecutionResult` (usage, cost, model). The `./ui-parser` export parses the same NDJSON into transcript entries.

## API

The root export also provides the model-discovery client and gateway routing metadata:

```ts
import { createServerAdapter, LiteLLMClient, litellmAdapter } from "@nihaopaul/paperclip-litellm-adapter";

const adapter = createServerAdapter();          // Paperclip plugin entry point
const client = new LiteLLMClient({ baseUrl: "…", apiKey: "…" });
const models = await client.discover();          // summaries joined with provider model
```

## Status

Pre-1.0. See the open [issues](https://github.com/nihaopaul/paperclip-litellm-adapter/issues) for known limitations (model auto-discovery in the UI, codex CLI availability, wake-payload prompt rendering, remote sandboxes).

## Development

```sh
corepack pnpm@9.15.4 install
corepack pnpm@9.15.4 typecheck
corepack pnpm@9.15.4 test
corepack pnpm@9.15.4 build
```
