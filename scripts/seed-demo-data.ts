import { getTenantBySlug } from "@/modules/tenancy/tenants";
import { buildSystemTenantContext } from "@/modules/tenancy/context";
import { listPipelines, listStagesForPipeline } from "@/modules/crm/pipelines";
import { createContact } from "@/modules/crm/contacts";
import { createDeal } from "@/modules/crm/deals";
import { createTask } from "@/modules/crm/tasks";

// Throwaway script (not part of the product) to populate a tenant with
// realistic-looking demo data for UI screenshots. Not idempotent — safe to
// run once against a fresh seeded tenant.

const CONTACTS = [
  { name: "Laura Gonzalez", phone: "+595981234001", email: "laura.gonzalez@example.com", source: "WhatsApp" },
  { name: "Diego Fernandez", phone: "+595981234002", email: "diego.fernandez@example.com", source: "Website" },
  { name: "Marcela Ruiz", phone: "+595981234003", email: "marcela.ruiz@example.com", source: "Referral" },
  { name: "Hugo Benitez", phone: "+595981234004", email: "hugo.benitez@example.com", source: "WhatsApp" },
  { name: "Sofia Cabrera", phone: "+595981234005", email: "sofia.cabrera@example.com", source: "Facebook Ads" },
  { name: "Ramon Duarte", phone: "+595981234006", email: "ramon.duarte@example.com", source: "WhatsApp" },
  { name: "Valentina Ortiz", phone: "+595981234007", email: "valentina.ortiz@example.com", source: "Website" },
  { name: "Ariel Ayala", phone: "+595981234008", email: "ariel.ayala@example.com", source: "Referral" },
];

const DEAL_TITLES = [
  "Paquete premium - Sofa 3 cuerpos",
  "Instalacion aire acondicionado",
  "Consultoria contable mensual",
  "Reforma cocina completa",
  "Plan anual mantenimiento",
  "Venta lote Barrio San Roque",
  "Servicio flete mudanza",
  "Diseno web + branding",
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
      value: Math.round(500000 + Math.random() * 9500000),
      currency: "PYG",
    });
    console.log(`Deal: ${DEAL_TITLES[i]} -> ${deal?.id}`);
  }

  const firstContact = contacts[0];
  if (firstContact) {
    await createTask(ctx, {
      title: "Llamar para confirmar propuesta",
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
