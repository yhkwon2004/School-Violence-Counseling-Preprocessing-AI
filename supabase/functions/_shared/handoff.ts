import { sha256 } from './hash.ts';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;

export function normalizeHandoffCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function formatHandoffCode(code: string) {
  const normalized = normalizeHandoffCode(code);
  return normalized.length > 5
    ? `${normalized.slice(0, 5)}-${normalized.slice(5)}`
    : normalized;
}

export function createPlainHandoffCode() {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return formatHandoffCode(code);
}

export async function hashHandoffCode(code: string, pepper: string) {
  const normalized = normalizeHandoffCode(code);
  if (normalized.length < CODE_LENGTH) throw new Error('인계 코드 형식이 올바르지 않습니다.');
  return sha256(`${pepper}:${normalized}`);
}

export function handoffPepper() {
  return Deno.env.get('HANDOFF_CODE_PEPPER') ?? 'ieumlog-local-dev-pepper';
}
