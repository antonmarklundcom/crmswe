import { afterEach, describe, expect, it, vi } from "vitest";
import { reportError, resetErrorSink, setErrorSink } from "./index";

afterEach(() => {
  resetErrorSink();
  vi.restoreAllMocks();
});

describe("reportError", () => {
  it("forwards the error and its context to the sink", () => {
    const calls: Array<[unknown, unknown]> = [];
    setErrorSink((error, context) => calls.push([error, context]));

    const boom = new Error("boom");
    reportError(boom, { tags: { jobType: "whatsapp.send" }, extra: { jobId: "1" } });

    expect(calls).toEqual([[boom, { tags: { jobType: "whatsapp.send" }, extra: { jobId: "1" } }]]);
  });

  it("never throws, even when the sink does", () => {
    setErrorSink(() => {
      throw new Error("sink is down");
    });
    expect(() => reportError(new Error("boom"))).not.toThrow();
  });
});
