// Lite-Harness stream-json stdout parser for Paperclip's external-adapter UI.
//
// This file is loaded as a plain string and evaluated inside Paperclip's
// sandboxed Web Worker (no imports, no DOM, no network). It must therefore be
// fully self-contained and use CJS-style `exports` assignment — not ESM.
//
// The wire protocol is NDJSON on the Lite-Harness server's stdout. One JSON
// object per line, demultiplexed on the top-level `type` field.

"use strict";

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map(function (block) {
        if (!block || typeof block !== "object") return "";
        if (typeof block.text === "string") return block.text;
        if (typeof block.thinking === "string") return block.thinking;
        return "";
      })
      .filter(Boolean)
      .join("");
  }
  return "";
}

exports.parseStdoutLine = function parseStdoutLine(line, ts) {
  var trimmed = String(line || "").trim();
  if (!trimmed) return [];

  var obj;
  try {
    obj = JSON.parse(trimmed);
  } catch (e) {
    return [];
  }
  if (!obj || typeof obj !== "object") return [];

  switch (obj.type) {
    case "system":
      if (obj.subtype === "init") {
        return [{
          kind: "init",
          ts: ts,
          model: String(obj.model || ""),
          sessionId: String(obj.session_id || ""),
        }];
      }
      return [];

    case "assistant": {
      var entries = [];
      var content = obj.message && obj.message.content;
      if (Array.isArray(content)) {
        for (var i = 0; i < content.length; i++) {
          var block = content[i];
          if (!block || typeof block !== "object") continue;
          if (block.type === "text" && typeof block.text === "string" && block.text) {
            entries.push({ kind: "assistant", ts: ts, text: block.text });
          } else if (block.type === "thinking" && typeof block.thinking === "string" && block.thinking) {
            entries.push({ kind: "thinking", ts: ts, text: block.thinking });
          } else if (block.type === "tool_use") {
            entries.push({
              kind: "tool_call",
              ts: ts,
              name: String(block.name || ""),
              input: block.input,
              toolUseId: typeof block.id === "string" ? block.id : undefined,
            });
          }
        }
      }
      return entries;
    }

    case "stream_event": {
      var ev = obj.event;
      if (!ev || typeof ev !== "object") return [];
      if (ev.type === "content_block_delta" && ev.delta) {
        if (ev.delta.type === "text_delta" && typeof ev.delta.text === "string") {
          return [{ kind: "assistant", ts: ts, text: ev.delta.text, delta: true }];
        }
        if (ev.delta.type === "thinking_delta" && typeof ev.delta.thinking === "string") {
          return [{ kind: "thinking", ts: ts, text: ev.delta.thinking, delta: true }];
        }
      }
      return [];
    }

    case "user": {
      var userText = textOf(obj.message && obj.message.content);
      return userText ? [{ kind: "user", ts: ts, text: userText }] : [];
    }

    case "result": {
      var usage = obj.usage && typeof obj.usage === "object" ? obj.usage : {};
      return [{
        kind: "result",
        ts: ts,
        text: String(obj.result || ""),
        inputTokens: Number(usage.input_tokens || 0) || 0,
        outputTokens: Number(usage.output_tokens || 0) || 0,
        cachedTokens: Number(usage.cache_read_input_tokens || 0) || 0,
        costUsd: Number(obj.total_cost_usd || 0) || 0,
        subtype: String(obj.subtype || "success"),
        isError: Boolean(obj.is_error),
        errors: [],
      }];
    }

    default:
      return [];
  }
};
