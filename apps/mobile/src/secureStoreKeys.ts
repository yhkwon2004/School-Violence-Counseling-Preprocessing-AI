const SAFE_KEY_PATTERN = /[^A-Za-z0-9._-]/g;

export function secureStoreKey(...parts: string[]) {
  return parts
    .map((part) => part.replace(SAFE_KEY_PATTERN, '_'))
    .filter(Boolean)
    .join('.');
}
