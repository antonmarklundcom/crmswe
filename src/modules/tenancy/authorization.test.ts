import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantRole } from "./context";

// Role enforcement on the server actions §3.2 reserves for `admin`
// (PLAN.md §13 H1). The point of this suite is that the guard lives on the
// *action*, not on the page that renders its button: hiding a form is UX,
// and a server action is a public POST endpoint to anyone holding a session.
//
// Nothing here touches MySQL — unlike the isolation suites it runs on every
// `npm test`, because it is a merge gate for a mistake that is one deleted
// line away at any time. Only the two boundaries `getTenantContext` reaches
// (the Better Auth session and the tenant/subscription lookups) are stubbed;
// the context module itself, including `requireTenantAdmin`, runs for real.

let role: TenantRole = "agent";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("@/lib/auth/server", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "user-1", tenantId: "tenant-1", role },
        session: { impersonatedBy: null },
      }),
    },
  },
}));

// getTenantContext re-reads the acting user on every request so a
// deactivated session dies immediately (§13 H4). Only that lookup is
// stubbed; the rest of the module is the real thing.
vi.mock("./users", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./users")>()),
  getActiveTenantUser: async (userId: string, tenantId: string) => ({
    id: userId,
    tenantId,
    role,
    banned: false,
  }),
}));

vi.mock("./tenants", () => ({
  getTenant: async (id: string) => ({ id, name: "Tenant", slug: "tenant", status: "active" }),
}));

vi.mock("./subscriptions", () => ({
  computeAccessStatus: async () => "active" as const,
}));

// Next's request-scoped helpers are no-ops here: the actions under test must
// reject before reaching either, and a real `redirect()` throws.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirected");
  }),
}));

// One mock per service module the actions delegate to. Asserting these were
// never called is the second half of each test: an action that swallowed the
// authorization error and carried on would still "reject" if only the throw
// were checked.
const flows = {
  createFlow: vi.fn(async () => ({ id: "flow-1" })),
  saveDraft: vi.fn(async () => undefined),
  publishFlow: vi.fn(async () => ({ ok: true as const })),
  setFlowStatus: vi.fn(async () => undefined),
};
const engine = { cancelRun: vi.fn(async () => undefined) };
const forms = {
  createForm: vi.fn(async () => ({ id: "form-1" })),
  getForm: vi.fn(async () => ({ id: "form-1", settings: {} })),
  updateForm: vi.fn(async () => undefined),
};
const pipelines = {
  createPipelineWithDefaultStages: vi.fn(async () => ({ id: "pipeline-1" })),
};
const deals = {
  moveDeal: vi.fn(async () => undefined),
  createDeal: vi.fn(async () => ({ id: "deal-1" })),
};
const products = {
  createProduct: vi.fn(async () => ({ id: "product-1" })),
  updateProduct: vi.fn(async () => undefined),
};
const deletion = {
  deleteContactRecord: vi.fn(async () => undefined),
  deleteDealRecord: vi.fn(async () => undefined),
};
const documents = {
  createDocument: vi.fn(async () => ({ id: "doc-1" })),
  updateDraftDocument: vi.fn(async () => undefined),
  issueDocument: vi.fn(async () => undefined),
  voidDocument: vi.fn(async () => undefined),
  recordPayment: vi.fn(async () => undefined),
  deletePayment: vi.fn(async () => undefined),
};

vi.mock("@/modules/automations/flows", () => flows);
vi.mock("@/modules/automations/engine", () => engine);
vi.mock("@/modules/forms/forms", () => forms);
vi.mock("@/modules/crm/pipelines", () => pipelines);
vi.mock("@/modules/crm/deals", () => deals);
vi.mock("@/modules/quotes/products", () => products);
vi.mock("@/modules/documents/documents", () => documents);
vi.mock("@/modules/crm/deletion", async (importOriginal) => ({
  // RecordDeleteError stays real: the actions catch it by instance, so a
  // stubbed class would change which branch they take.
  ...(await importOriginal<typeof import("@/modules/crm/deletion")>()),
  ...deletion,
}));
vi.mock("@/modules/tenancy/audit", () => ({ writeAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/modules/documents/delivery", () => ({
  sendDocumentToContact: vi.fn(async () => undefined),
}));

const automationActions = await import("@/app/(app)/automations/actions");
const formActions = await import("@/app/(app)/forms/actions");
const pipelineActions = await import("@/app/(app)/pipeline/actions");
const productActions = await import("@/app/(app)/products/actions");
const documentActions = await import("@/app/(app)/documents/actions");
const contactActions = await import("@/app/(app)/contacts/actions");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/**
 * Each case is a valid call — the payloads pass their own zod schema — so a
 * rejection can only come from the role check. `service` is the delegate that
 * must not run.
 */
const adminOnlyActions: Array<{
  name: string;
  service: () => ReturnType<typeof vi.fn>;
  call: () => Promise<unknown>;
}> = [
  {
    name: "automations: createFlowAction",
    service: () => flows.createFlow,
    call: () =>
      automationActions.createFlowAction(
        { error: null, field: null, values: {} },
        form({ name: "Bienvenida", triggerType: "form_submitted" }),
      ),
  },
  {
    name: "automations: saveDraftAction",
    service: () => flows.saveDraft,
    call: () =>
      automationActions.saveDraftAction(
        "flow-1",
        JSON.stringify({
          nodes: [
            {
              id: "n1",
              type: "trigger",
              config: { triggerType: "form_submitted" },
            },
          ],
          edges: [],
        }),
      ),
  },
  {
    name: "automations: publishFlowAction",
    service: () => flows.publishFlow,
    call: () => automationActions.publishFlowAction("flow-1"),
  },
  {
    name: "automations: setFlowStatusAction",
    service: () => flows.setFlowStatus,
    call: () =>
      automationActions.setFlowStatusAction(form({ flowId: "flow-1", status: "active" })),
  },
  {
    name: "automations: cancelRunAction",
    service: () => engine.cancelRun,
    call: () => automationActions.cancelRunAction(form({ runId: "run-1", flowId: "flow-1" })),
  },
  {
    name: "forms: createFormAction",
    service: () => forms.createForm,
    call: () =>
      formActions.createFormAction(
        { error: null, field: null, values: {} },
        form({ name: "Contacto", slug: "contacto" }),
      ),
  },
  {
    name: "forms: updateFormTurnstileAction",
    service: () => forms.updateForm,
    call: () =>
      formActions.updateFormTurnstileAction(
        form({ formId: "form-1", turnstileSiteId: "site-1" }),
      ),
  },
  {
    name: "pipeline: createPipelineAction",
    service: () => pipelines.createPipelineWithDefaultStages,
    call: () => pipelineActions.createPipelineAction(form({ name: "Ventas" })),
  },
  {
    name: "products: createProductAction",
    service: () => products.createProduct,
    call: () =>
      productActions.createProductAction(
        { error: null, field: null, values: {} },
        form({ name: "Instalación", unitPrice: "250000" }),
      ),
  },
  {
    name: "products: toggleProductAction",
    service: () => products.updateProduct,
    call: () =>
      productActions.toggleProductAction(form({ productId: "product-1", isActive: "false" })),
  },
  {
    name: "documents: voidDocumentAction",
    service: () => documents.voidDocument,
    call: () =>
      documentActions.voidDocumentAction(
        { error: null, values: { reason: "" } },
        form({ documentId: "doc-1", reason: "cargada por error" }),
      ),
  },
  {
    name: "contacts: deleteContactAction",
    service: () => deletion.deleteContactRecord,
    call: () => contactActions.deleteContactAction(form({ contactId: "contact-1" })),
  },
  {
    name: "pipeline: deleteDealAction",
    service: () => deletion.deleteDealRecord,
    call: () => pipelineActions.deleteDealAction(form({ dealId: "deal-1" })),
  },
  {
    name: "documents: deletePaymentAction",
    service: () => documents.deletePayment,
    call: () =>
      documentActions.deletePaymentAction(form({ documentId: "doc-1", paymentId: "pay-1" })),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  role = "agent";
});

describe("admin-only server actions", () => {
  for (const { name, service, call } of adminOnlyActions) {
    it(`rejects an agent — ${name}`, async () => {
      await expect(call()).rejects.toThrow(/administrador/i);
      expect(service()).not.toHaveBeenCalled();
    });
  }

  // The control: without it every test above would still pass if the action
  // threw for some unrelated reason (a bad payload, a missing mock).
  for (const { name, service, call } of adminOnlyActions) {
    it(`runs for an admin — ${name}`, async () => {
      role = "admin";
      // createFlowAction/createPipelineAction end in redirect(), which throws
      // by design — the assertion that matters is the delegate having run.
      await call().catch(() => undefined);
      expect(service()).toHaveBeenCalled();
    });
  }
});

describe("actions that stay open to an agent", () => {
  // The other half of §3.2: agents work deals and sell. A guard added here by
  // mistake would take the product away from the role that uses it daily.
  it("lets an agent move a deal", async () => {
    await pipelineActions.moveDealAction({
      dealId: "deal-1",
      toStageId: "stage-1",
      toPosition: 0,
    });
    expect(deals.moveDeal).toHaveBeenCalled();
  });

  it("lets an agent issue a document and record a payment", async () => {
    await documentActions.issueDocumentAction(form({ documentId: "doc-1" }));
    expect(documents.issueDocument).toHaveBeenCalled();

    await documentActions.recordPaymentAction(
      { error: null, field: null, values: {} },
      form({ documentId: "doc-1", amount: "100000" }),
    );
    expect(documents.recordPayment).toHaveBeenCalled();
  });
});
