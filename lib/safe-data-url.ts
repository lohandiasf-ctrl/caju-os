// Chat and N1 evidence are persisted as data URLs. Never trust the MIME supplied
// by the browser: it must match the URL and the file signature before storage.
const signatures: Record<string, (bytes: Uint8Array) => boolean> = {
  'image/png': (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  'image/jpg': (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  'image/gif': (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]) && (b[4] === 0x37 || b[4] === 0x39),
  'image/webp': (b) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP'),
  'application/pdf': (b) => ascii(b, 0, '%PDF-'),
  'audio/mpeg': (b) => startsWith(b, [0x49, 0x44, 0x33]) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  'audio/wav': (b) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE'),
  'audio/ogg': (b) => ascii(b, 0, 'OggS'),
  'audio/flac': (b) => ascii(b, 0, 'fLaC'),
  'audio/aac': (b) => b[0] === 0xff && (b[1] & 0xf6) === 0xf0,
  'audio/webm': (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]),
  'audio/mp4': (b) => ascii(b, 4, 'ftyp'),
  'audio/x-m4a': (b) => ascii(b, 4, 'ftyp'),
  'audio/3gpp': (b) => ascii(b, 4, 'ftyp'),
  'video/mp4': (b) => ascii(b, 4, 'ftyp'),
  'video/quicktime': (b) => ascii(b, 4, 'ftyp'),
  'video/webm': (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]),
};

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes: Uint8Array, offset: number, value: string) {
  return [...value].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
}

export function isSafeDataUrl(data: string, mimeType: string, maxLength: number): boolean {
  const typeMatch = /^([a-z0-9.+-]+\/[a-z0-9.+-]+)(?:;codecs=[a-z0-9.,-]+)?$/i.exec(mimeType);
  const baseType = typeMatch?.[1].toLowerCase() ?? '';
  if (data.length > maxLength || !signatures[baseType]) return false;
  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+(?:;codecs=[a-z0-9.,-]+)?);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(data);
  if (!match || match[1] !== mimeType || match[2].length % 4 !== 0) return false;
  try {
    const binary = atob(match[2]);
    if (!binary || btoa(binary) !== match[2]) return false;
    const bytes = Uint8Array.from(binary.slice(0, 16), (char) => char.charCodeAt(0));
    return signatures[baseType](bytes);
  } catch {
    return false;
  }
}

// Cheap rendering guard for legacy rows created before signature validation.
// New writes must still pass the full isSafeDataUrl check above.
export function hasSafeDataUrlType(data: string, mimeType: string): boolean {
  const typeMatch = /^([a-z0-9.+-]+\/[a-z0-9.+-]+)(?:;codecs=[a-z0-9.,-]+)?$/i.exec(mimeType);
  return Boolean(typeMatch && signatures[typeMatch[1].toLowerCase()] && data.startsWith(`data:${mimeType};base64,`));
}

export function isSafeUpload(file: File, maxBytes: number): Promise<boolean> {
  if (!file.size || file.size > maxBytes || !signatures[file.type]) return Promise.resolve(false);
  return file.slice(0, 16).arrayBuffer().then((buffer) => signatures[file.type](new Uint8Array(buffer)));
}
