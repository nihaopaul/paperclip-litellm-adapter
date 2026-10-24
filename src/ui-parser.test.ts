import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type Parser = (line: string, ts: string) => Array<Record<string, unknown>>;

// Load the self-contained plain-JS parser the way Paperclip's sandboxed worker
// does: evaluate the source with `exports` / `module` shims and read the result.
function loadParser(): Parser {
  const path = fileURLToPath(new URL("../vendor/ui-parser.js", import.meta.url));
  const source = readFileSync(path, "utf-8");
  const exports: Record<string, unknown> = {};
  const module = { exports };
  const factory = new Function("exports", "module", `"use strict";\n{\n${source}\n}`);
  factory(exports, module);
  const resolved = Object.keys(module.exports ?? {}).length > 0 ? module.exports : exports;
  const parse = resolved.parseStdoutLine as Parser;
  if (typeof parse !== "function") throw new Error("ui-parser did not expose parseStdoutLine");
  return parse;
}

describe("lite-harness ui-parser", () => {
  const parse = loadParser();

  it("parses an init line", () => {
    expect(parse(JSON.stringify({ type: "system", subtype: "init", session_id: "sess_1", model: "deepseek-flash" }), "t0"))
      .toEqual([{ kind: "init", ts: "t0", model: "deepseek-flash", sessionId: "sess_1" }]);
  });

  it("parses assistant text and thinking blocks", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { model: "m", content: [
        { type: "thinking", thinking: "think", signature: "s" },
        { type: "text", text: "Hi" },
      ] },
    });
    expect(parse(line, "t1")).toEqual([
      { kind: "thinking", ts: "t1", text: "think" },
      { kind: "assistant", ts: "t1", text: "Hi" },
    ]);
  });

  it("parses a stream delta as a delta assistant entry", () => {
    const line = JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "lo" } } });
    expect(parse(line, "t2")).toEqual([{ kind: "assistant", ts: "t2", text: "lo", delta: true }]);
  });

  it("parses a result line into usage and cost", () => {
    const line = JSON.stringify({
      type: "result", subtype: "success", is_error: false, total_cost_usd: 0.04, result: "done",
      usage: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 3 },
    });
    expect(parse(line, "t3")[0]).toMatchObject({
      kind: "result", text: "done", inputTokens: 10, outputTokens: 2, cachedTokens: 3, costUsd: 0.04, isError: false,
    });
  });

  it("ignores control responses and unknown lines", () => {
    expect(parse(JSON.stringify({ type: "control_response", response: { request_id: "r" } }), "t4")).toEqual([]);
    expect(parse("not json", "t5")).toEqual([]);
  });
});
