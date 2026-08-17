import { Inter, Space_Grotesk } from "next/font/google";
import { submitContactAction } from "./actions";
import {
  BUSINESS_NAME,
  CONTACT_EMAIL,
  CRM_URL,
  PRICE_ANCHOR,
  SITE_URL,
  WHATSAPP_DISPLAY,
  waLink,
} from "./config";
import { marketingCss } from "./styles";

// Two families, four weights total — the performance budget for a lead-gen
// page. next/font self-hosts them and emits font-display: swap.
const heading = Space_Grotesk({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--mkt-font-heading",
  display: "swap",
});
const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--mkt-font-body",
  display: "swap",
});

const SERVICES = [
  {
    title: "Meta Ads",
    body: "Campañas en Facebook e Instagram apuntadas a quien compra, no a quien mira. Creativos, segmentación y optimización semanal.",
    span: "wide",
  },
  {
    title: "Google Ads",
    body: "Aparecé justo cuando alguien busca lo que vendés. Búsqueda, Performance Max y remarketing.",
  },
  {
    title: "SEO",
    body: "Posicionamiento local y nacional para que te encuentren sin pagar por cada clic.",
  },
  {
    title: "Sitios web que venden",
    body: "Páginas rápidas, pensadas para móvil y para convertir en WhatsApp — no folletos digitales.",
  },
  {
    title: "CRM y automatización",
    body: "Cada lead entra a un embudo, con seguimiento automático por WhatsApp. Nada se pierde en un cuaderno.",
    span: "wide",
  },
] as const;

const STEPS = [
  {
    n: "1",
    title: "Hablamos 20 minutos",
    body: "Me contás qué vendés, a quién y qué estás haciendo hoy. Sin costo y sin compromiso.",
  },
  {
    n: "2",
    title: "Armamos el plan",
    body: "Definimos canal, presupuesto y meta de leads por mes. Te digo qué esperar y en cuánto tiempo.",
  },
  {
    n: "3",
    title: "Ejecutamos y medís",
    body: "Lanzamos las campañas y cada lead cae en tu CRM. Ves de dónde vino cada uno y qué costó.",
  },
] as const;

const FAQS = [
  {
    q: "¿Cuánto tengo que invertir en publicidad?",
    a: "Depende del rubro y de la zona. En la llamada te digo un rango realista para tu caso antes de que gastes un guaraní, y si creo que no te conviene invertir todavía, te lo digo.",
  },
  {
    q: "¿En cuánto tiempo veo resultados?",
    a: "Con Meta Ads y Google Ads los primeros leads suelen llegar en la primera semana. SEO es distinto: es trabajo de meses, y así lo planteo desde el principio.",
  },
  {
    q: "¿Me atan a un contrato largo?",
    a: "No. Trabajamos mes a mes. Si el trabajo no rinde, te vas sin penalidad.",
  },
  {
    q: "¿Los leads son míos?",
    a: "Sí. Entran a tu propio CRM, con tu cuenta y tus datos. Si dejamos de trabajar juntos, la base queda con vos.",
  },
  {
    q: "¿Trabajás con cualquier rubro?",
    a: "Trabajo sobre todo con negocios de servicios y comercios en Paraguay. Si tu rubro no encaja o ya tenés algo que funciona, te lo digo en la llamada.",
  },
] as const;

const WA_HERO = "Hola, quiero más clientes para mi negocio. ¿Podemos hablar?";

export const marketingMetadata = {
  title: `${BUSINESS_NAME} — Marketing digital que trae clientes en Paraguay`,
  description:
    "Meta Ads, Google Ads, SEO y sitios web para negocios en Paraguay. Cada lead entra a tu propio CRM y sabés de dónde vino y cuánto costó.",
};

export default function MarketingPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfessionalService",
        "@id": `${SITE_URL}/#business`,
        name: BUSINESS_NAME,
        url: SITE_URL,
        areaServed: { "@type": "Country", name: "Paraguay" },
        description: marketingMetadata.description,
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: FAQS.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <div className={`mkt ${heading.variable} ${body.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: marketingCss }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="mkt-header">
        <div className="mkt-wrap mkt-header-in">
          <span className="mkt-logo">{BUSINESS_NAME}</span>
          <a className="mkt-link" href={`${CRM_URL}/login`}>
            Ingresar al CRM
          </a>
        </div>
      </header>

      <main>
        {/* Hero — what, for whom, next step, all above the fold at 390px. */}
        <section className="mkt-hero">
          <div className="mkt-wrap">
            <h1 className="mkt-h1">
              Más clientes para tu negocio en Paraguay
            </h1>
            <p className="mkt-lead">
              Publicidad en Google y Meta, SEO y sitios web que convierten. Cada
              consulta entra a tu propio CRM, con seguimiento por WhatsApp para
              que ninguna se enfríe.
            </p>
            <div className="mkt-cta-row">
              <a className="mkt-btn" href={waLink(WA_HERO)}>
                Escribinos por WhatsApp
              </a>
              <a className="mkt-btn-ghost" href="#contacto">
                O dejanos tus datos
              </a>
            </div>
            <p className="mkt-note">
              Respondemos el mismo día hábil · Sin contratos largos
            </p>
          </div>
        </section>

        {/* Structural trust only — no invented logos, counters or ratings. */}
        <section className="mkt-strip">
          <div className="mkt-wrap mkt-strip-in">
            <div>
              <strong>Mes a mes</strong>
              <span>Sin permanencia obligatoria</span>
            </div>
            <div>
              <strong>Todo medido</strong>
              <span>Sabés qué costó cada lead</span>
            </div>
            <div>
              <strong>La base es tuya</strong>
              <span>Tus contactos, tu CRM</span>
            </div>
          </div>
        </section>

        <section className="mkt-section" id="servicios">
          <div className="mkt-wrap">
            <h2 className="mkt-h2">Qué hacemos</h2>
            <p className="mkt-sub">
              Todo apunta a lo mismo: que entren consultas y que puedas
              atenderlas.
            </p>
            <div className="mkt-bento">
              {SERVICES.map((s) => (
                <article
                  key={s.title}
                  className={
                    "span" in s && s.span === "wide"
                      ? "mkt-cell mkt-cell-wide"
                      : "mkt-cell"
                  }
                >
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mkt-section mkt-section-alt" id="como">
          <div className="mkt-wrap">
            <h2 className="mkt-h2">Cómo trabajamos</h2>
            <ol className="mkt-steps">
              {STEPS.map((s) => (
                <li key={s.n}>
                  <span className="mkt-step-n">{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
            <div className="mkt-center">
              <a className="mkt-btn" href={waLink(WA_HERO)}>
                Empezá por WhatsApp
              </a>
            </div>
          </div>
        </section>

        <section className="mkt-section" id="precio">
          <div className="mkt-wrap mkt-narrow">
            <h2 className="mkt-h2">Qué cuesta</h2>
            {PRICE_ANCHOR ? (
              <p className="mkt-price">
                Desde <strong>₲ {PRICE_ANCHOR.amount}</strong> por{" "}
                {PRICE_ANCHOR.period}, más la inversión en publicidad.
              </p>
            ) : (
              <p className="mkt-sub">
                El presupuesto depende del rubro, la zona y el canal. En la
                primera llamada te doy un número concreto y qué esperar por esa
                inversión — sin vueltas.
              </p>
            )}
            <p className="mkt-sub">
              La inversión publicitaria la pagás vos directo a Google o Meta.
              Nunca queda en el medio.
            </p>
          </div>
        </section>

        <section className="mkt-section mkt-section-alt" id="faq">
          <div className="mkt-wrap mkt-narrow">
            <h2 className="mkt-h2">Preguntas frecuentes</h2>
            <div className="mkt-faq">
              {FAQS.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Form posts to a Server Action, so it works without JavaScript. */}
        <section className="mkt-section" id="contacto">
          <div className="mkt-wrap mkt-narrow">
            <h2 className="mkt-h2">Contanos qué necesitás</h2>
            <p className="mkt-sub">
              Dejanos tu número y te escribimos. Si preferís, escribinos directo
              por WhatsApp al {WHATSAPP_DISPLAY}.
            </p>
            <form className="mkt-form" action={submitContactAction}>
              <label>
                <span>Nombre</span>
                <input name="nombre" autoComplete="name" required />
              </label>
              <label>
                <span>WhatsApp / teléfono</span>
                <input
                  name="telefono"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0981 123 456"
                  required
                />
              </label>
              <label>
                <span>Email (opcional)</span>
                <input name="email" type="email" autoComplete="email" />
              </label>
              <label>
                <span>¿Qué te interesa?</span>
                <select name="servicio" defaultValue="">
                  <option value="">Elegí una opción</option>
                  <option>Meta Ads</option>
                  <option>Google Ads</option>
                  <option>SEO</option>
                  <option>Sitio web</option>
                  <option>CRM y automatización</option>
                  <option>No sé, necesito asesoramiento</option>
                </select>
              </label>
              <label>
                <span>Contanos un poco (opcional)</span>
                <textarea name="mensaje" rows={4} />
              </label>
              {/* Honeypot — hidden from people, tempting to bots. */}
              <input
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="mkt-hp"
              />
              <button className="mkt-btn mkt-btn-block" type="submit">
                Quiero más clientes
              </button>
            </form>
          </div>
        </section>

        <section className="mkt-final">
          <div className="mkt-wrap mkt-center">
            <h2 className="mkt-h2-light">¿Empezamos?</h2>
            <p>Una llamada de 20 minutos y sabés si te sirve.</p>
            <a className="mkt-btn" href={waLink(WA_HERO)}>
              Escribinos por WhatsApp
            </a>
          </div>
        </section>
      </main>

      <footer className="mkt-footer">
        <div className="mkt-wrap mkt-footer-in">
          <span>
            © {new Date().getFullYear()} {BUSINESS_NAME} · Paraguay
          </span>
          <span className="mkt-footer-links">
            <a href={waLink(WA_HERO)}>WhatsApp {WHATSAPP_DISPLAY}</a>
            {CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : null}
            <a href={`${CRM_URL}/login`}>Ingresar al CRM</a>
          </span>
        </div>
      </footer>

      {/* Sticky mobile CTA — the single attention cue allowed on the page. */}
      <a className="mkt-sticky" href={waLink(WA_HERO)}>
        Escribinos por WhatsApp
      </a>
    </div>
  );
}
