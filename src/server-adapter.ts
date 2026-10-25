import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AdapterConfigSchema,
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterExecutionContext,
  AdapterExecutionResult,
  ServerAdapterModule,
} from "@paperclipai/adapter-utils";
import {
  asNumber,
  asString,
  buildPaperclipEnv,
  buildRuntimeToolsEnv,
  parseObject,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";

const ADAPTER_TYPE = "lite_harness";
const PAPERCLIP_WAKE_PAYLOAD_KEY = "paperclipWake";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, "../vendor/lite-harness-server");
const SERVER_ENTRY = path.join(SERVER_DIR, "server.mjs");

/**
 * The Paperclip task prompt arrives as `ctx.context["paperclipWake"]`, a
 * structured payload. Pull a usable prompt string out of it; the exact wake
 * rendering is refined later (see the gh issue).
 */
function extractPrompt(context: Record<string, unknown>): string {
  const wake = context[PAPERCLIP_WAKE_PAYLOAD_KEY];
  if (typeof wake === "string" && wake.trim()) return wake;
  if (wake && typeof wake === "object") {
    const w = wake as Record<string, unknown>;
    for (const key of ["prompt", "task", "body", "description", "objective", "message", "summary"]) {
      const value = w[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    try {
      return JSON.stringify(wake);
    } catch {
      /* fall through */
    }
  }
  return String(wake ?? "");
}

interface StreamJsonResult {
  subtype?: unknown;
  model?: unknown;
  is_error?: unknown;
  total_cost_usd?: unknown;
  usage?: Record<string, unknown>;
  result?: unknown;
  errorMessage?: unknown;
}

/** Find the last stream-json `result` line in captured stdout. */
function parseResultLine(stdout: string): StreamJsonResult | null {
  const lines = stdout.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as { type?: string };
      if (obj && obj.type === "result") return obj as StreamJsonResult;
    } catch {
      /* ignore partial lines */
    }
  }
  return null;
}

function asInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function createServerAdapter(): ServerAdapterModule {
  return {
    type: ADAPTER_TYPE,
    models: [],
    supportsLocalAgentJwt: true,

    async getConfigSchema(): Promise<AdapterConfigSchema> {
      const modelOptions: Array<{ label: string; value: string }> = [];
      const baseUrl = process.env.LITELLM_API_BASE ?? "";
      const apiKey = process.env.LITELLM_API_KEY ?? "";
      if (baseUrl && apiKey) {
        try {
          const { LiteLLMClient } = await import("./client.js");
          const models = await new LiteLLMClient({ baseUrl, apiKey }).discover();
          for (const model of models) {
            if (model.id) modelOptions.push({ label: model.id, value: model.id });
          }
        } catch {
          // Discovery failed — leave options empty; the field still accepts a typed value.
        }
      }
      return {
        fields: [
          {
            key: "gatewayBaseUrl",
            label: "LiteLLM gateway URL",
            type: "text",
            default: process.env.LITELLM_API_BASE ?? "",
            hint: "Prefills from LITELLM_API_BASE. e.g. http://192.168.2.47:14000 (HTTPS for non-loopback).",
          },
          {
            key: "apiKey",
            label: "LiteLLM API key",
            type: "text",
            meta: { password: true },
            hint: "Prefills from LITELLM_API_KEY when left blank.",
          },
          {
            key: "model",
            label: "Model",
            type: "combobox",
            options: modelOptions,
            default: process.env.LITELLM_DEFAULT_MODEL ?? "",
            hint: "Discovered from your gateway; type to use a different model.",
          },
          {
            key: "harness",
            label: "Harness",
            type: "select",
            required: true,
            default: "claude",
            options: [
              { label: "Claude (Claude Code)", value: "claude" },
              { label: "Codex", value: "codex" },
              { label: "Pi", value: "pi" },
            ],
          },
        ],
      };
    },

    async testEnvironment(
      ctx: AdapterEnvironmentTestContext,
    ): Promise<AdapterEnvironmentTestResult> {
      const checks: AdapterEnvironmentCheck[] = [];
      const config = parseObject(ctx.config);
      const gatewayBaseUrl = asString(config.gatewayBaseUrl, "").trim() || (process.env.LITELLM_API_BASE ?? "").trim();
      const apiKey = asString(config.apiKey, "").trim() || (process.env.LITELLM_API_KEY ?? "").trim();
      const model = asString(config.model, "").trim() || (process.env.LITELLM_DEFAULT_MODEL ?? "").trim();

      if (!existsSync(SERVER_ENTRY)) {
        checks.push({
          code: "lite_harness_server_missing",
          level: "error",
          message: "Bundled Lite-Harness server is missing.",
          hint: "Reinstall the adapter package.",
        });
      } else {
        checks.push({
          code: "lite_harness_server_present",
          level: "info",
          message: `Lite-Harness server: ${SERVER_ENTRY}`,
        });
      }

      if (!gatewayBaseUrl) {
        checks.push({ code: "gateway_url_missing", level: "error", message: "LiteLLM gateway URL is required." });
      }
      if (!apiKey) {
        checks.push({ code: "api_key_missing", level: "error", message: "LiteLLM API key is required." });
      }
      if (!model) {
        checks.push({ code: "model_missing", level: "error", message: "Model is required." });
      }

      if (gatewayBaseUrl && apiKey) {
        // Reachability probe against the gateway's /models endpoint.
        try {
          const { LiteLLMClient } = await import("./client.js");
          const client = new LiteLLMClient({ baseUrl: gatewayBaseUrl, apiKey });
          const models = await client.listModels();
          checks.push({
            code: "gateway_reachable",
            level: "info",
            message: `Gateway reachable: ${models.length} model(s) returned.`,
          });
        } catch (err) {
          checks.push({
            code: "gateway_unreachable",
            level: "error",
            message: err instanceof Error ? err.message : "Gateway unreachable",
            detail: gatewayBaseUrl,
          });
        }
      }

      const status: AdapterEnvironmentTestResult["status"] =
        checks.some((c) => c.level === "error") ? "fail" : "pass";

      return { adapterType: ctx.adapterType, status, checks, testedAt: new Date().toISOString() };
    },

    async execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
      const config = parseObject(ctx.config);
      const gatewayBaseUrl = asString(config.gatewayBaseUrl, "").trim() || (process.env.LITELLM_API_BASE ?? "").trim();
      const apiKey = asString(config.apiKey, "").trim() || (process.env.LITELLM_API_KEY ?? "").trim();
      const model = asString(config.model, "").trim() || (process.env.LITELLM_DEFAULT_MODEL ?? "").trim();
      const harness = asString(config.harness, "claude").trim() || "claude";
      const cwd = asString(config.cwd, process.cwd());
      const timeoutSec = asNumber(config.timeoutSec, 600);
      const graceSec = asNumber(config.graceSec, 15);

      if (!gatewayBaseUrl || !apiKey || !model) {
        return {
          exitCode: 1,
          signal: null,
          timedOut: false,
          errorMessage: "LiteLLM gateway URL, API key, and model are required.",
          executionRecovery: { kind: "bootstrap", providerWorkStarted: false },
        };
      }

      const env: Record<string, string> = {
        ...buildPaperclipEnv(ctx.agent, ctx.agentIdentity),
        ...buildRuntimeToolsEnv(ctx.runtimeTools),
        LITELLM_API_BASE: gatewayBaseUrl,
        LITELLM_API_KEY: apiKey,
        LITELLM_DEFAULT_MODEL: model,
      };

      const prompt = extractPrompt(ctx.context ?? {}) || "Complete the assigned task.";
      const stdin = [
        JSON.stringify({
          type: "control_request",
          request_id: "req_1",
          request: { subtype: "initialize", hooks: {}, sdk_mcp_servers: [] },
        }),
        JSON.stringify({
          type: "user",
          message: { role: "user", content: prompt },
          session_id: null,
          parent_tool_use_id: null,
        }),
      ].join("\n") + "\n";

      let proc;
      try {
        proc = await runChildProcess(
          ctx.runId,
          process.execPath,
          [
            SERVER_ENTRY,
            "--input-format", "stream-json",
            "--output-format", "stream-json",
            "--agent", harness,
            "--model", model,
            ...(cwd ? ["--cwd", cwd] : []),
          ],
          {
            cwd: SERVER_DIR,
            env,
            timeoutSec,
            graceSec,
            onLog: ctx.onLog,
            onSpawn: ctx.onSpawn,
            stdin,
          },
        );
      } catch (error) {
        return {
          exitCode: 1,
          signal: null,
          timedOut: false,
          errorMessage: error instanceof Error ? error.message : String(error),
          executionRecovery: { kind: "bootstrap", providerWorkStarted: false },
        };
      }

      if (proc.timedOut) {
        return {
          exitCode: proc.exitCode,
          signal: proc.signal,
          timedOut: true,
          errorMessage: `Timed out after ${timeoutSec}s`,
        };
      }

      const result = parseResultLine(proc.stdout ?? "");
      if (result) {
        const usage = result.usage && typeof result.usage === "object" ? result.usage : {};
        const inputTokens = asInt(usage.input_tokens);
        const outputTokens = asInt(usage.output_tokens);
        const cachedTokens = asInt(usage.cache_read_input_tokens);
        const costUsd = asInt(result.total_cost_usd);
        const isError = Boolean(result.is_error);
        const subtype = String(result.subtype ?? "success");

        return {
          exitCode: isError ? 1 : (proc.exitCode ?? 0),
          signal: proc.signal,
          timedOut: false,
          errorMessage: isError ? String(result.errorMessage ?? `Harness reported ${subtype}`) : null,
          usage: { inputTokens, outputTokens, cachedInputTokens: cachedTokens },
          costUsd,
          model: String(result.model ?? model),
          provider: "litellm",
          summary: String(result.result ?? "").slice(0, 2000),
          resultJson: {
            subtype,
            isError,
            result: String(result.result ?? ""),
            usage,
            totalCostUsd: result.total_cost_usd,
          },
        };
      }

      if ((proc.exitCode ?? 0) !== 0) {
        return {
          exitCode: proc.exitCode,
          signal: proc.signal,
          timedOut: false,
          errorMessage: `Harness exited with code ${proc.exitCode ?? -1}`,
          resultJson: { stdout: proc.stdout, stderr: proc.stderr },
        };
      }

      return {
        exitCode: proc.exitCode,
        signal: proc.signal,
        timedOut: false,
        resultJson: { stdout: proc.stdout, stderr: proc.stderr },
      };
    },
  };
}
