import { describe, expect, it, vi } from "vitest";

vi.mock("@paperclipai/adapter-utils/server-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@paperclipai/adapter-utils/server-utils")>();
  return { ...actual, runChildProcess: vi.fn() };
});

import { runChildProcess } from "@paperclipai/adapter-utils/server-utils";
import { createServerAdapter } from "./server-adapter.js";

const mockedRun = vi.mocked(runChildProcess);

function fakeCtx(overrides: Record<string, unknown> = {}) {
  return {
    runId: "run-1",
    agent: { id: "agent-1", name: "Test", adapterType: "lite_harness", adapterConfig: {} },
    agentIdentity: { keyId: "k", publicKeyPem: "pk", privateKeyPem: "sk" },
    runtime: {},
    config: { gatewayBaseUrl: "http://gw", apiKey: "sk-test", model: "m", harness: "claude" },
    context: {},
    runtimeTools: null,
    onLog: async () => {},
    onSpawn: async () => {},
    ...overrides,
  } as never;
}

function settledRun(partial: Partial<Awaited<ReturnType<typeof runChildProcess>>> = {}) {
  return {
    exitCode: null,
    signal: null as string | null,
    timedOut: false,
    stdout: "",
    stderr: "",
    pid: 1,
    startedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("server adapter interruption", () => {
  it("reports a clean interruption when the host aborts the run signal", async () => {
    const ac = new AbortController();
    ac.abort();
    mockedRun.mockResolvedValueOnce(settledRun({ signal: "SIGTERM" }));

    const result = await createServerAdapter().execute(fakeCtx({ signal: ac.signal }));

    expect(result.executionRecovery).toEqual({
      kind: "interrupted",
      providerStopped: true,
      sessionPreserved: true,
      actionOutcomes: "settled",
    });
  });

  it("reports a clean interruption when the child process was signal-killed", async () => {
    mockedRun.mockResolvedValueOnce(settledRun({ signal: "SIGTERM" }));

    const result = await createServerAdapter().execute(fakeCtx());

    expect(result.executionRecovery).toEqual({
      kind: "interrupted",
      providerStopped: true,
      sessionPreserved: true,
      actionOutcomes: "settled",
    });
  });

  it("does not report interruption for a normal successful exit", async () => {
    mockedRun.mockResolvedValueOnce(
      settledRun({
        exitCode: 0,
        stdout: JSON.stringify({ type: "result", subtype: "success", result: "ok", usage: {} }) + "\n",
      }),
    );

    const result = await createServerAdapter().execute(fakeCtx());

    expect(result.executionRecovery).toBeUndefined();
    expect(result.errorMessage).toBeNull();
  });
});
