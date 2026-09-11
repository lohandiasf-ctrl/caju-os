const FSA_KEY = /^FSA-\d+$/;

/** Extracts and normalizes FSA keys pasted with commas, spaces, or new lines. */
export function normalizeFsaKeys(values: unknown): string[] {
  const input = Array.isArray(values) ? values : [values];
  const result = new Set<string>();

  for (const value of input) {
    if (typeof value !== 'string') continue;
    for (const match of value.toUpperCase().matchAll(/FSA\s*-?\s*\d+/g)) {
      const key = match[0].replace(/\s+/g, '').replace(/^FSA-?/, 'FSA-');
      if (FSA_KEY.test(key)) result.add(key);
    }
  }

  return [...result];
}

export function isFsaKey(value: string) {
  return FSA_KEY.test(value.trim().toUpperCase());
}

export function elapsedLabel(startedAt: string, now = Date.now()) {
  const elapsed = Math.max(0, now - Date.parse(startedAt));
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `há ${hours}h ${remainder}min` : `há ${hours}h`;
}
