// Escaping for user text that becomes a SQL LIKE pattern.
//
// Pure and dependency-free, in lib/ rather than beside its caller for the
// same reason lib/money.ts and lib/phone.ts are: it can be unit-tested
// without a configured environment or a database (PLAN.md §10 1R #4).
//
// `%` and `_` are LIKE wildcards, so an unescaped query means something
// other than what the user typed: "50%" matches every row starting "50",
// and a bare "%%" matches the whole table.

export function escapeLike(value: string): string {
  // The backslash must be escaped first — doing it in one pass via the
  // character class avoids double-escaping the backslashes this adds.
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
