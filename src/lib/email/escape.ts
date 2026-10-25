// Escapa un valor controlado por un usuario o contacto antes de ponerlo dentro
// de HTML de email (texto o atributo). Las plantillas arman el HTML a mano, así
// que todo valor dinámico pasa por acá.
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]!);
}
