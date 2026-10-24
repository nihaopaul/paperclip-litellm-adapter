import type {
  LiteLLMClientOptions,
  LiteLLMModelInfo,
  LiteLLMModelSummary,
} from "./types.js";

/**
 * A minimal, dependency-free REST client for the two LiteLLM endpoints the
 * adapter needs for model discovery.
 *
 * The base URL is a caller-supplied value and is never hard-coded to loopback —
 * HTTPS endpoints work anywhere, and plain-HTTP is the caller's choice (e.g.
 * a loopback forward for a local LiteLLM).
 */
export class LiteLLMClient {
  readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: LiteLLMClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    return headers;
  }

  /** Fetch the OpenAI-compatible model list from `GET /models`. */
  async listModels(): Promise<LiteLLMModelSummary[]> {
    const response = await this.fetchFn(this.url("/models"), {
      headers: this.headers(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`LiteLLM /models failed with status ${response.status}`);
    }
    const body = (await response.json()) as { data?: LiteLLMModelSummary[] };
    return body.data ?? [];
  }

  /** Fetch per-model configuration from `GET /model/info`. */
  async modelInfo(): Promise<LiteLLMModelInfo[]> {
    const response = await this.fetchFn(this.url("/model/info"), {
      headers: this.headers(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`LiteLLM /model/info failed with status ${response.status}`);
    }
    const body = (await response.json()) as { data?: LiteLLMModelInfo[] };
    return body.data ?? [];
  }

  /** Convenience: model summaries with their underlying provider model joined in. */
  async discover(): Promise<Array<LiteLLMModelSummary & { providerModel?: string }>> {
    const [summaries, info] = await Promise.all([this.listModels(), this.modelInfo()]);
    const byName = new Map(info.map((entry) => [entry.model_name, entry]));
    return summaries.map((summary) => {
      const detail = byName.get(summary.id);
      return detail?.litellm_params?.model
        ? { ...summary, providerModel: detail.litellm_params.model }
        : summary;
    });
  }
}
