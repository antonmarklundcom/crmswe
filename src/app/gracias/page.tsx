import Link from "next/link";
import { BUSINESS_NAME, WHATSAPP_DISPLAY, waLink } from "../_marketing/config";

export const metadata = {
  title: `Gracias — ${BUSINESS_NAME}`,
  // Nothing to index here, and a thank-you page in search results is a leak
  // of who converted.
  robots: { index: false, follow: false },
};

export default function GraciasPage() {
  return (
    <main
      style={{
        minHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: "48px 24px",
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
        color: "#0B2545",
      }}
    >
      <h1 style={{ fontSize: "2rem", margin: 0, letterSpacing: "-0.02em" }}>
        ¡Gracias! Ya recibimos tus datos.
      </h1>
      <p style={{ margin: 0, color: "#4A5C75", maxWidth: "48ch" }}>
        Te escribimos el mismo día hábil. Si querés adelantar, escribinos ahora
        por WhatsApp al {WHATSAPP_DISPLAY}.
      </p>
      <a
        href={waLink("Hola, acabo de dejar mis datos en la web.")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          minHeight: 52,
          padding: "0 28px",
          borderRadius: 10,
          background: "#2EC4B6",
          color: "#04231F",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Escribinos por WhatsApp
      </a>
      <Link href="/" style={{ color: "#4A5C75", fontSize: 15 }}>
        Volver al inicio
      </Link>
    </main>
  );
}
