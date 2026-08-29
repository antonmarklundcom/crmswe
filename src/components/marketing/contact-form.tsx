import { submitContactAction } from "@/app/(marketing)/kontakt/actions";

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
        <label htmlFor="namn">{copy.name}</label>
        <input id="namn" name="namn" autoComplete="name" required />
      </div>

      <div className="mk-field">
        <label htmlFor="foretag">{copy.company}</label>
        <input id="foretag" name="foretag" autoComplete="organization" required />
      </div>

      <div className="mk-field">
        <label htmlFor="telefon">{copy.phone}</label>
        {/* Phone is contact identity in the CRM — the one genuinely required
            field. Local format is what people type; it is normalized
            server-side. */}
        <input
          id="telefon"
          name="telefon"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={copy.phonePlaceholder}
          aria-describedby="telefon-hint"
          required
        />
        <span id="telefon-hint" className="mk-meta">
          {copy.phoneHint}
        </span>
      </div>

      <div className="mk-field">
        <label htmlFor="email">{copy.emailOptional}</label>
        <input id="email" name="email" type="email" autoComplete="email" />
      </div>

      <div className="mk-field">
        <label htmlFor="bransch">{copy.sector}</label>
        <select id="bransch" name="bransch" defaultValue="">
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
        <label htmlFor="meddelande">{copy.messageOptional}</label>
        <textarea id="meddelande" name="meddelande" rows={4} />
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
        data-ev-loc="kontakt"
      >
        {copy.submit}
      </button>

      <p className="mk-meta" style={{ marginTop: "1rem", marginBottom: 0 }}>
        {copy.privacy}
      </p>
    </form>
  );
}
