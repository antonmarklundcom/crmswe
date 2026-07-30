// Node 18+ no longer sorts DNS results IPv4-first, so a `localhost` host in
// DATABASE_URL resolves to `::1` and MySQL sees the connection as
// `user'@'::1`. Hostinger's managed MySQL only grants the app user
// `'user'@'localhost'`/`'127.0.0.1'`, so that connection is rejected with
// "Access denied ... (using password: YES)" even though the password is
// correct — which surfaces as an opaque HTTP 500 on every route that touches
// the database, sign-in included. Pin loopback to IPv4 so the grant matches.
export function forceIpv4Loopback(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost" || parsed.hostname === "[::1]") {
      parsed.hostname = "127.0.0.1";
      return parsed.toString();
    }
    return url;
  } catch {
    // Not a parseable URL (mysql2 also accepts other forms) — leave it alone
    // and let the driver report the problem.
    return url;
  }
}
