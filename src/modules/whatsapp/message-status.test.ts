import { describe, expect, it } from "vitest";
import { advancesMessageStatus } from "./message-status";

// Meta redelivers status webhooks and can deliver them out of order
// (PLAN.md §6.3 rule 3), so the ingest path has to decide which ones are
// actually progress.

describe("advancesMessageStatus", () => {
  it("accepts the normal forward progression", () => {
    expect(advancesMessageStatus("queued", "sent")).toBe(true);
    expect(advancesMessageStatus("sent", "delivered")).toBe(true);
    expect(advancesMessageStatus("delivered", "read")).toBe(true);
  });

  it("refuses a redelivered older status that would walk the message backwards", () => {
    expect(advancesMessageStatus("read", "sent")).toBe(false);
    expect(advancesMessageStatus("read", "delivered")).toBe(false);
    expect(advancesMessageStatus("delivered", "sent")).toBe(false);
  });

  it("refuses a repeat of the status already stored", () => {
    expect(advancesMessageStatus("read", "read")).toBe(false);
    expect(advancesMessageStatus("sent", "sent")).toBe(false);
  });

  it("always applies a failure, and never un-fails a message afterwards", () => {
    expect(advancesMessageStatus("sent", "failed")).toBe(true);
    expect(advancesMessageStatus("delivered", "failed")).toBe(true);
    expect(advancesMessageStatus("failed", "sent")).toBe(false);
    expect(advancesMessageStatus("failed", "read")).toBe(false);
    expect(advancesMessageStatus("failed", "failed")).toBe(false);
  });
});
