import { getTenantBySlug } from "@/modules/tenancy/tenants";
import { buildSystemTenantContext } from "@/modules/tenancy/context";
import { listPipelines, listStagesForPipeline } from "@/modules/crm/pipelines";
import { createContact } from "@/modules/crm/contacts";
import { createDeal } from "@/modules/crm/deals";
import { createTask } from "@/modules/crm/tasks";

// Throwaway script (not part of the product) to populate a tenant with
// realistic-looking demo data for UI screenshots. Not idempotent — safe to
// run once against a fresh seeded tenant.

// Swedish demo tenant (plan.md §5.1.7). Phone numbers are E.164 Swedish
// mobiles in the 46 70-123 4xxx range and every email is @example.com, which
// is reserved for exactly this by RFC 2606 — no real person's contact details
// end up in a screenshot.
const CONTACTS = [
  { name: "Anna Lindqvist", phone: "+46701234001", email: "anna.lindqvist@example.com", source: "Webbformulär" },
  { name: "Erik Sandberg", phone: "+46701234002", email: "erik.sandberg@example.com", source: "Webbplats" },
  { name: "Maria Öberg", phone: "+46701234003", email: "maria.oberg@example.com", source: "Rekommendation" },
  { name: "Johan Hedlund", phone: "+46701234004", email: "johan.hedlund@example.com", source: "Google" },
  { name: "Sofia Ahlgren", phone: "+46701234005", email: "sofia.ahlgren@example.com", source: "Facebook Ads" },
  { name: "Per Nyström", phone: "+46701234006", email: "per.nystrom@example.com", source: "Webbformulär" },
  { name: "Elin Wikström", phone: "+46701234007", email: "elin.wikstrom@example.com", source: "Webbplats" },
  { name: "Karl Sjöberg", phone: "+46701234008", email: "karl.sjoberg@example.com", source: "Rekommendation" },
];

const DEAL_TITLES = [
  "Serviceavtal kontorsstädning",
  "Installation luftvärmepump",
  "Löpande bokföring, månadsvis",
  "Totalrenovering kök",
  "Årligt underhållsavtal",
  "Utbyte av tak, villa",
  "Flyttjänst inkl. magasinering",
  "Webbplats + varumärkespaket",
];

async function main() {
  const slug = process.argv[2] ?? "acme-demo";
  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error(`Tenant not found: ${slug}`);

  const ctx = await buildSystemTenantContext(tenant.id);
  if (!ctx) throw new Error("Could not build tenant context");

  const pipelines = await listPipelines(ctx);
  const pipeline = pipelines[0];
  if (!pipeline) throw new Error("No pipeline found for tenant");

  const contacts = [];
  for (const c of CONTACTS) {
    const contact = await createContact(ctx, c);
    contacts.push(contact);
    console.log(`Contact: ${c.name}`);
  }

  const stages = await listStagesForPipeline(ctx, pipeline.id);
  if (stages.length === 0) throw new Error("No stages found for pipeline");

  for (let i = 0; i < DEAL_TITLES.length; i++) {
    const contact = contacts[i % contacts.length];
    if (!contact) continue;
    const stage = stages[i % Math.min(4, stages.length)]!;
    const deal = await createDeal(ctx, {
      contactId: contact.id,
      pipelineId: pipeline.id,
      stageId: stage.id,
      title: DEAL_TITLES[i]!,
      // Öre (plan.md §1.2): 5 000–100 000 kr, rounded to whole kronor so the
      // demo screens show believable amounts rather than 47 831,17 kr.
      value: Math.round(5000 + Math.random() * 95000) * 100,
    });
    console.log(`Deal: ${DEAL_TITLES[i]} -> ${deal?.id}`);
  }

  const firstContact = contacts[0];
  if (firstContact) {
    await createTask(ctx, {
      title: "Ring och stäm av offerten",
      contactId: firstContact.id,
      dueAt: new Date(Date.now() + 2 * 24 * 3600 * 1000),
    });
    console.log("Task created");
  }

  console.log("Demo data seeded.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
