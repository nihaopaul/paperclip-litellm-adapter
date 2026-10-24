import { describe, expect, it, vi } from "vitest";
import { LiteLLMClient } from "./client.js";

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

describe("LiteLLMClient", () => {
  it("lists models from /models with a bearer key and trims the base URL", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      jsonResponse({ data: [{ id: "deepseek-flash", mode: "chat" }] }),
    );
    const client = new LiteLLMClient({
      baseUrl: "https://litellm.example.com/",
      apiKey: "sk-test",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const models = await client.listModels();
    expect(models).toEqual([{ id: "deepseek-flash", mode: "chat" }]);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://litellm.example.com/models",
      expect.objectContaining({
        headers: { Accept: "application/json", Authorization: "Bearer sk-test" },
      }),
    );
  });

  it("surfaces non-2xx as an error", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ error: "nope" }, 401));
    const client = new LiteLLMClient({
      baseUrl: "http://127.0.0.1:14000",
      apiKey: "sk-test",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(client.listModels()).rejects.toThrow("status 401");
  });

  it("joins provider model from /model/info in discover()", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/models")) {
        return jsonResponse({ data: [{ id: "gemini-3.1-pro" }] });
      }
      if (url.endsWith("/model/info")) {
        return jsonResponse({
          data: [{ model_name: "gemini-3.1-pro", litellm_params: { model: "gemini/gemini-3.1-pro" } }],
        });
      }
      return jsonResponse({ data: [] });
    });
    const client = new LiteLLMClient({
      baseUrl: "http://127.0.0.1:14000",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const discovered = await client.discover();
    expect(discovered).toEqual([
      { id: "gemini-3.1-pro", providerModel: "gemini/gemini-3.1-pro" },
    ]);
  });
});
