import { createHash, randomBytes } from 'node:crypto';

/** Token aleatório opaco (256 bits), seguro para URLs e cookies. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hash SHA-256 em hexadecimal. Usado para guardar tokens sem armazená-los em texto puro. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
