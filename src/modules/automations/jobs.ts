import { registerHandler } from "@/worker/handlers";
import { buildSystemTenantContext } from "@/modules/tenancy/context";
import { advanceRun, resumeAfterDelay, timeoutWaitForReply } from "./engine";
import { dispatchTrigger, registerAutomationTriggers, type TriggerPayload } from "./triggers";

// Job handlers for the automation engine (PLAN.md §7.2). Importing this
// module also subscribes the engine to the domain event buses, so the
// worker process wires triggers by loading it — same side-effect pattern as
// modules/whatsapp/jobs.ts.

registerAutomationTriggers();

registerHandler("automation.trigger", async (payload) => {
  await dispatchTrigger(payload as TriggerPayload);
});

registerHandler("automation.advance", async (payload, tenantId) => {
  if (!tenantId) throw new Error("automation.advance job missing tenantId");
  const { runId } = payload as { runId: string };
  const ctx = await buildSystemTenantContext(tenantId);
  if (!ctx) return;
  await advanceRun(ctx, runId);
});

registerHandler("automation.resume", async (payload, tenantId) => {
  if (!tenantId) throw new Error("automation.resume job missing tenantId");
  const { runId, nodeId } = payload as { runId: string; nodeId: string };
  const ctx = await buildSystemTenantContext(tenantId);
  if (!ctx) return;
  await resumeAfterDelay(ctx, runId, nodeId);
});

registerHandler("automation.timeout", async (payload, tenantId) => {
  if (!tenantId) throw new Error("automation.timeout job missing tenantId");
  const { runId, nodeId } = payload as { runId: string; nodeId: string };
  const ctx = await buildSystemTenantContext(tenantId);
  if (!ctx) return;
  await timeoutWaitForReply(ctx, runId, nodeId);
});
