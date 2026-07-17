import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { env } from "@/lib/config/env";

// Per-tenant secrets at rest (WhatsApp tokens, later SIFEN certs) — PLAN.md §3.4.
// Key comes from APP_ENCRYPTION_KEY (32-byte hex), never logged, never sent to the client.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  tag: string;
};

function getKey(): Buffer {
  return Buffer.from(env.APP_ENCRYPTION_KEY, "hex");
}

export function encrypt(plaintext: string): EncryptedPayload {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decrypt(payload: EncryptedPayload): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
