import { beforeAll, describe, expect, it } from "vitest";

// Default "Försäljning" pipeline seeded at tenant creation (PLAN.md §5: "a default
// pipeline seeded at tenant creation"). Without this a brand-new tenant has
// an empty board and can't create a deal until someone manually adds stages.
// Runs only against a real MySQL, same skip pattern as isolation.test.ts.
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("default pipeline seeding", () => {
  let newId: (typeof import("@/lib/ids"))["newId"];
  let createTenant: (typeof import("@/modules/tenancy/tenants"))["createTenant"];
  let buildSystemTenantContext: (typeof import("@/modules/tenancy/context"))["buildSystemTenantContext"];
  let seedDefaultPipeline: (typeof import("./pipelines"))["seedDefaultPipeline"];
  let listStagesForPipeline: (typeof import("./pipelines"))["listStagesForPipeline"];

  type TenantContext = import("@/modules/tenancy/context").TenantContext;
  const superadmin = { userId: "sa-test", impersonatorUserId: null } as const;

  let ctx: TenantContext;

  beforeAll(async () => {
    ({ newId } = await import("@/lib/ids"));
    ({ createTenant } = await import("@/modules/tenancy/tenants"));
    ({ buildSystemTenantContext } = await import("@/modules/tenancy/context"));
    ({ seedDefaultPipeline, listStagesForPipeline } = await import("./pipelines"));

    const tenant = await createTenant(superadmin, {
      name: "Pipeline Seed Tenant",
      slug: `pipeline-seed-${newId()}`,
    });
    const built = await buildSystemTenantContext(tenant!.id);
    if (!built) throw new Error("failed to build tenant context");
    ctx = built;
  });

  it("gives a new tenant a Försäljning pipeline with a full, colored, won/lost-marked stage set", async () => {
    const pipeline = await seedDefaultPipeline(ctx);
    expect(pipeline?.name).toBe("Försäljning");

    const stages = await listStagesForPipeline(ctx, pipeline!.id);
    expect(stages.map((s) => s.name)).toEqual([
      "Ny kontakt",
      "Kontaktad",
      "Offert skickad",
      "Förhandling",
      "Vunnen",
      "Förlorad",
    ]);

    // Every stage gets a distinct color so the board isn't monochrome.
    const colors = stages.map((s) => s.color);
    expect(colors.every((c) => !!c)).toBe(true);
    expect(new Set(colors).size).toBe(colors.length);

    const won = stages.find((s) => s.name === "Vunnen");
    const lost = stages.find((s) => s.name === "Förlorad");
    expect(won?.isWon).toBe(true);
    expect(won?.isLost).toBe(false);
    expect(lost?.isLost).toBe(true);
    expect(lost?.isWon).toBe(false);
  });
});
