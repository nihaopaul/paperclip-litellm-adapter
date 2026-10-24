/**
 * The Paperclip-facing adapter definition for LiteLLM.
 *
 * This is the standalone metadata + routing shape. The actual registration into
 * Paperclip's UI registry (and the setup form) lives in a thin Paperclip-core
 * PR; this package owns the stable, testable parts so both can share one
 * source of truth.
 */

/** The adapter type id Paperclip's registry uses. */
export const LITELLM_ADAPTER_TYPE = "litellm_gateway" as const;

/**
 * The gateway protocols LiteLLM can serve, mapped to the Paperclip harness each
 * one requires. Paperclip's `aiProviderRoutingSchema` supports these three for
 * `kind: "gateway"`:
 *   - chat      -> opencode_local  (OpenAI Chat Completions)
 *   - responses -> codex_local     (OpenAI Responses)
 *   - messages  -> claude_local    (Anthropic Messages)
 */
export const LITELLM_PROTOCOL_HARNESSES = {
  chat: "opencode_local",
  responses: "codex_local",
  messages: "claude_local",
} as const;

export type LiteLLMProtocol = keyof typeof LITELLM_PROTOCOL_HARNESSES;

export const LITELLM_PROTOCOLS = Object.keys(
  LITELLM_PROTOCOL_HARNESSES,
) as LiteLLMProtocol[];

export interface LiteLLMAdapterDefinition {
  type: typeof LITELLM_ADAPTER_TYPE;
  label: string;
  description: string;
  recommended: true;
  /** Routing shape Paperclip expects for a gateway provider. */
  routingKind: "gateway";
  /** Default auth; LiteLLM virtual keys are bearer tokens. */
  auth: "bearer";
  protocols: readonly LiteLLMProtocol[];
  protocolHarnesses: Readonly<Record<LiteLLMProtocol, string>>;
}

export const litellmAdapter: LiteLLMAdapterDefinition = {
  type: LITELLM_ADAPTER_TYPE,
  label: "LiteLLM",
  description: "LiteLLM proxy gateway (OpenAI- and Anthropic-compatible)",
  recommended: true,
  routingKind: "gateway",
  auth: "bearer",
  protocols: LITELLM_PROTOCOLS,
  protocolHarnesses: LITELLM_PROTOCOL_HARNESSES,
};
