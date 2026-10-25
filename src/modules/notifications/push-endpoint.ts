// Un endpoint de suscripción push es una URL que el servidor luego POSTea
// (web-push). Si se aceptara cualquiera, un usuario logueado podría apuntar al
// servidor a direcciones internas (SSRF ciego). Los navegadores reales solo
// producen endpoints de estos servicios de push, así que se exige https, sin
// credenciales, puerto por defecto y un host de la lista.

const EXACT_HOSTS = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
]);

// Sufijos con al menos una etiqueta delante (incluye wns2-*.notify.windows.com).
const SUFFIX_HOSTS = [".push.services.mozilla.com", ".push.apple.com", ".notify.windows.com"];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  if (url.port !== "") return false; // https:443 se normaliza a ""
  const host = url.hostname;
  if (EXACT_HOSTS.has(host)) return true;
  return SUFFIX_HOSTS.some((suffix) => host.endsWith(suffix) && host.length > suffix.length);
}
