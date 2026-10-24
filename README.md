# @nihaopaul/paperclip-litellm-adapter

A LiteLLM gateway adapter for [Paperclip](https://github.com/paperclipai/paperclip). It lets Paperclip treat any LiteLLM proxy as a first-class model provider, auto-discovering the available models from the LiteLLM instance instead of asking the user to type model IDs.

## What it does

- **Discovers models** from your LiteLLM via `GET /models` and `GET /model/info`.
- **Supports all three gateway protocols** Paperclip understands:

| Protocol | LiteLLM API surface | Paperclip harness |
|---|---|---|
| `chat` | OpenAI Chat Completions (`/v1/chat/completions`) | `opencode_local` |
| `responses` | OpenAI Responses (`/v1/responses`) | `codex_local` |
| `messages` | Anthropic Messages (`/v1/messages`) | `claude_local` |

- Maps to Paperclip's `gateway` routing (`kind: "gateway"`, `auth: "bearer"`).

## Install

```sh
pnpm add @nihaopaul/paperclip-litellm-adapter
```

## Usage (client)

```ts
import { LiteLLMClient, litellmAdapter } from "@nihaopaul/paperclip-litellm-adapter";

const client = new LiteLLMClient({
  baseUrl: "https://litellm.example.com", // or http://127.0.0.1:14000 for a local forward
  apiKey: "sk-…",                        // your LiteLLM virtual key
});

const models = await client.listModels();     // [{ id, mode, max_input_tokens, … }]
const info   = await client.modelInfo();      // [{ model_name, litellm_params: { model: "gemini/gemini-3.1-pro", … } }]
const merged = await client.discover();       // summaries joined with their provider model

console.log(litellmAdapter.type);             // "litellm_gateway"
```

## Adapter definition

`litellmAdapter` exports the stable metadata and routing shape:

```ts
{
  type: "litellm_gateway",
  label: "LiteLLM",
  recommended: true,
  routingKind: "gateway",
  auth: "bearer",
  protocols: ["chat", "responses", "messages"],
  protocolHarnesses: { chat: "opencode_local", responses: "codex_local", messages: "claude_local" },
}
```

## Paperclip integration

This package owns the self-contained parts (the client + the definition). Wiring the "LiteLLM" tile into Paperclip's onboarding list is a thin core PR that:

1. registers `litellm_gateway` in `ui/src/adapters/` (via `registerUIAdapter` + `adapterDisplayMap`),
2. adds a setup form (base URL + key → live model picker from `discover()`),
3. saves the connection with `routing: { kind: "gateway", protocol, baseUrl, auth: "bearer", models }`.

See Paperclip's `doc/connections/CONNECTOR-PLAYBOOK.md` for the authoring runbook.

## Security note

The base URL is fully user-supplied — nothing here hard-codes loopback. Paperclip core, however, only accepts **plain HTTP for loopback** addresses and requires **HTTPS** otherwise (to avoid sending your key in cleartext). This package does not bypass that; prefer `https://` for anything non-local.

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```
