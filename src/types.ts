/**
 * Types for the LiteLLM proxy REST API surface the adapter consumes.
 *
 * LiteLLM exposes two families relevant here:
 *  - `GET /models`      -> OpenAI-compatible model summaries (id, mode, token caps)
 *  - `GET /model/info`  -> per-model LiteLLM config (the underlying provider model)
 *
 * Both require a Bearer API key (a LiteLLM virtual key or master key).
 */

/** One entry from `GET /models` (OpenAI-compatible `{ data: [...] }`). */
export interface LiteLLMModelSummary {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
  /** LiteLLM annotates `mode` as `"chat"` for chat models. */
  mode?: string;
  max_input_tokens?: number;
  max_output_tokens?: number;
  [key: string]: unknown;
}

/** One entry from `GET /model/info` (LiteLLM's `{ data: [...] }`). */
export interface LiteLLMModelInfo {
  model_name: string;
  model_info?: Record<string, unknown>;
  litellm_params?: {
    /** The underlying provider-qualified model, e.g. `gemini/gemini-3.1-pro`. */
    model?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Configuration for a `LiteLLMClient`. */
export interface LiteLLMClientOptions {
  /** The LiteLLM proxy base URL, e.g. `https://litellm.example.com` or `http://127.0.0.1:14000`. */
  baseUrl: string;
  /** Bearer API key. Omit only for a LiteLLM instance configured with no auth. */
  apiKey?: string;
  /** Injectable fetch (for tests and non-global-fetch runtimes). */
  fetchFn?: typeof fetch;
}
