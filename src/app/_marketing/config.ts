/**
 * clientes.com.py — marketing site configuration.
 *
 * This is the only file you need to edit to put the site live with your real
 * details. Everything below is read by the marketing page and the contact
 * form; nothing here is used by the CRM itself (crm.clientes.com.py).
 */

/**
 * WhatsApp number in international format, digits only, no + or spaces.
 * Paraguay mobile 0981 123 456 becomes 595981123456.
 *
 * TODO(anton): replace with the real number before launch.
 */
export const WHATSAPP_NUMBER = "595000000000";

/** Human-readable version shown on the page. */
export const WHATSAPP_DISPLAY = "0981 000 000";

/** Contact email shown in the footer. Set to null to hide it. */
export const CONTACT_EMAIL: string | null = null;

/**
 * Price anchor for the offer section. A concrete "desde" figure converts
 * better than "consultanos", but it has to be a real number you will honor —
 * set it when you have decided. Leave null and the section asks for a
 * presupuesto instead of quoting a figure.
 *
 * Example: { amount: "2.500.000", period: "mes" }
 */
export const PRICE_ANCHOR: { amount: string; period: string } | null = null;

/** Canonical origin of the marketing site, used for metadata and JSON-LD. */
export const SITE_URL = "https://clientes.com.py";

/** Where the CRM lives — the login link points here. */
export const CRM_URL = "https://crm.clientes.com.py";

export const BUSINESS_NAME = "Clientes.com.py";

/** Builds a WhatsApp deep link with the chat pre-filled so it starts qualified. */
export function waLink(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
