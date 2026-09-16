// Reading of what a vision model answers about a RAT photo. Kept apart from
// the route so the shapes models actually return are covered by tests.

export type Extraction = {
  identifiedProblem: string;
  testsPerformed: string;
  partToReplace: string;
  confidence: 'alta' | 'media' | 'baixa';
  info?: string;
};

export function emptyExtraction(info: string): Extraction {
  return { identifiedProblem: '', testsPerformed: '', partToReplace: '', confidence: 'baixa', info };
}

function fields(parsed: Record<string, unknown>): Extraction {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const confidence = parsed.confidence;
  return {
    identifiedProblem: text(parsed.identifiedProblem),
    testsPerformed: text(parsed.testsPerformed),
    partToReplace: text(parsed.partToReplace),
    confidence: confidence === 'alta' || confidence === 'media' ? confidence : 'baixa',
  };
}

// Models answer in three shapes: an object already parsed (llama-4-scout does
// this), JSON as text, or JSON fenced in markdown (mistral does this). Prose
// with no JSON returns null, so the caller can try the next model.
export function parseExtraction(raw: unknown): Extraction | null {
  if (raw && typeof raw === 'object') return fields(raw as Record<string, unknown>);
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return fields(JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function hasContent(extraction: Extraction) {
  return Boolean(extraction.identifiedProblem || extraction.testsPerformed || extraction.partToReplace);
}

// btoa needs a binary string; spreading 10 MB at once overflows the stack.
export function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}
