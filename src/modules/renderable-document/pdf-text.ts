import { inflateSync } from "node:zlib";

// Reads the text back out of a rendered PDF, for tests.
//
// The fingerprint test next door proves a document's layout did not change by
// accident. It cannot prove the document *says* the right things — a faktura
// missing its momsspecifikation has a perfectly stable fingerprint. This is
// the other half: it recovers the printed strings so a test can assert that
// every field mervärdesskattelagen requires actually appears on the page
// (plan.md §5.2.3).
//
// react-pdf writes text as hex runs inside TJ/Tj operators in Flate-compressed
// content streams, split at kerning pairs — "OFFERT" comes out as
// `[<4f46464552> 20 <54>]`. So: inflate every stream, pull the hex runs, and
// concatenate. Runs are joined without separators within a stream, which
// reassembles kerned words; a marker is inserted between streams so text from
// different pages cannot form a phrase that was never printed.
//
// Test-only, and deliberately approximate: it makes no attempt to reproduce
// layout or reading order, only to answer "does this string appear".

/** Separates streams so a match can't span two of them. */
const STREAM_BREAK = "\n";

export function pdfText(pdf: Buffer): string {
  const parts: string[] = [];

  let cursor = 0;
  while (cursor < pdf.length) {
    const start = pdf.indexOf("stream", cursor);
    if (start < 0) break;
    const end = pdf.indexOf("endstream", start);
    if (end < 0) break;

    let body = start + "stream".length;
    // The keyword is followed by CRLF or LF before the data begins.
    while (body < end && (pdf[body] === 0x0d || pdf[body] === 0x0a)) body++;

    try {
      const inflated = inflateSync(pdf.subarray(body, end)).toString("latin1");
      parts.push(textOfContentStream(inflated));
    } catch {
      // Not a Flate stream (a font file, an image) — nothing to read here.
    }
    cursor = end + "endstream".length;
  }

  return parts.join(STREAM_BREAK);
}

/** Pulls the hex-encoded runs out of one content stream's TJ/Tj operators. */
function textOfContentStream(stream: string): string {
  let out = "";
  // `<hex>` runs; the numbers between them are kerning adjustments and carry
  // no characters.
  for (const match of stream.matchAll(/<([0-9A-Fa-f]*)>/g)) {
    const hex = match[1];
    if (hex.length === 0 || hex.length % 2 !== 0) continue;
    let text = "";
    for (let i = 0; i < hex.length; i += 2) {
      text += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
    }
    out += text;
  }
  return out;
}
