import { submitContactAction } from "@/app/(marketing)/contacto/actions";

export type ContactFormCopy = {
  name: string;
  company: string;
  phone: string;
  phonePlaceholder: string;
  phoneHint: string;
  emailOptional: string;
  sector: string;
  sectorPlaceholder: string;
  sectorOptions: string[];
  messageOptional: string;
  submit: string;
  privacy: string;
  honeypotLabel: string;
};

export function ContactForm({ copy }: { copy: ContactFormCopy }) {
  return (
    <form action={submitContactAction}>
      <div className="mk-field">
        <label htmlFor="nombre">{copy.name}</label>
        <input id="nombre" name="nombre" autoComplete="name" required />
      </div>

      <div className="mk-field">
        <label htmlFor="empresa">{copy.company}</label>
        <input id="empresa" name="empresa" autoComplete="organization" required />
      </div>

      <div className="mk-field">
        <label htmlFor="telefono">{copy.phone}</label>
        {/* Phone is contact identity in the CRM — the one genuinely required
            field. Local format is what people type; it is normalized to
            +595… server-side. */}
        <input
          id="telefono"
          name="telefono"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={copy.phonePlaceholder}
          aria-describedby="telefono-hint"
          required
        />
        <span id="telefono-hint" className="mk-meta">
          {copy.phoneHint}
        </span>
      </div>

      <div className="mk-field">
        <label htmlFor="email">{copy.emailOptional}</label>
        <input id="email" name="email" type="email" autoComplete="email" />
      </div>

      <div className="mk-field">
        <label htmlFor="rubro">{copy.sector}</label>
        <select id="rubro" name="rubro" defaultValue="">
          <option value="" disabled>
            {copy.sectorPlaceholder}
          </option>
          {copy.sectorOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="mk-field">
        <label htmlFor="mensaje">{copy.messageOptional}</label>
        <textarea id="mensaje" name="mensaje" rows={4} />
      </div>

      {/* Honeypot: costs three lines and removes most bot traffic before it
          ever reaches the pipeline. */}
      <div className="mk-honeypot" aria-hidden="true">
        <label htmlFor="website">{copy.honeypotLabel}</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <button
        type="submit"
        className="mk-btn mk-btn--primary"
        data-ev="form_submit"
        data-ev-loc="contacto"
      >
        {copy.submit}
      </button>

      <p className="mk-meta" style={{ marginTop: "1rem", marginBottom: 0 }}>
        {copy.privacy}
      </p>
    </form>
  );
}
