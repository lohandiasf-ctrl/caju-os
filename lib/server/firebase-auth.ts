import { eq, or } from 'drizzle-orm';
import { appUsers } from '@/db/schema';
import { getDb } from '@/db';
import type { UserRole } from '@/lib/permissions';

const FIREBASE_PROJECT_ID = 'caju-websys';
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

type FirebaseClaims = {
  aud: string;
  email?: string;
  email_verified?: boolean;
  exp: number;
  iat: number;
  iss: string;
  sub: string;
  user_id?: string;
};
type FirebaseJwk = JsonWebKey & { kid: string };

export type AuthorizedUser = {
  uid: string;
  email: string;
  role: UserRole;
};

let jwksCache: { expiresAt: number; keys: FirebaseJwk[] } | null = null;

export async function requireApiUser(request: Request, allowedRoles?: UserRole[]): Promise<AuthorizedUser> {
  const token = bearerToken(request);
  if (!token) throw jsonError('Autenticação necessária.', 401);

  const claims = await verifyFirebaseToken(token);
  const db = getDb();
  const normalizedEmail = claims.email?.trim().toLowerCase();
  if (!normalizedEmail) {
    throw jsonError('Confirme o e-mail da conta antes de entrar.', 403);
  }

  // A recreated Firebase account receives a new UID. The e-mail is also checked
  // against the administrator-managed access table, so invited users can enter
  // even before Firebase marks the e-mail as verified.
  const record = await db.select({
    uid: appUsers.firebaseUid,
    email: appUsers.email,
    role: appUsers.role,
    active: appUsers.active,
  }).from(appUsers).where(or(
    eq(appUsers.firebaseUid, claims.sub),
    eq(appUsers.email, normalizedEmail),
  )).get();

  if (!record || !record.active) throw jsonError('Usuário sem acesso ao sistema.', 403);
  if (normalizedEmail !== record.email.toLowerCase()) throw jsonError('Identidade do usuário não confere.', 403);
  if (allowedRoles && !allowedRoles.includes(record.role)) throw jsonError('Perfil sem permissão para esta ação.', 403);

  return { uid: record.uid, email: record.email, role: record.role };
}

async function verifyFirebaseToken(token: string): Promise<FirebaseClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw jsonError('Token inválido.', 401);

  const header = decodeJson<{ alg?: string; kid?: string }>(parts[0]);
  const claims = decodeJson<FirebaseClaims>(parts[1]);
  const now = Math.floor(Date.now() / 1000);

  if (header.alg !== 'RS256' || !header.kid) throw jsonError('Token inválido.', 401);
  if (claims.aud !== FIREBASE_PROJECT_ID || claims.iss !== FIREBASE_ISSUER) throw jsonError('Token de outro projeto.', 401);
  if (!claims.sub || claims.sub.length > 128 || claims.exp <= now || claims.iat > now + 60) throw jsonError('Token expirado ou inválido.', 401);

  const jwk = (await firebaseJwks()).find((key) => key.kid === header.kid);
  if (!jwk) {
    jwksCache = null;
    const refreshed = (await firebaseJwks()).find((key) => key.kid === header.kid);
    if (!refreshed) throw jsonError('Assinatura desconhecida.', 401);
    return verifySignature(refreshed, parts, claims);
  }
  return verifySignature(jwk, parts, claims);
}

async function verifySignature(jwk: JsonWebKey, parts: string[], claims: FirebaseClaims) {
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64UrlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw jsonError('Assinatura inválida.', 401);
  return claims;
}

async function firebaseJwks() {
  if (jwksCache && jwksCache.expiresAt > Date.now()) return jwksCache.keys;
  const response = await fetch(JWKS_URL);
  if (!response.ok) throw jsonError('Não foi possível validar a sessão.', 503);
  const payload = await response.json() as { keys: FirebaseJwk[] };
  const maxAge = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] ?? 300);
  jwksCache = { keys: payload.keys, expiresAt: Date.now() + maxAge * 1000 };
  return payload.keys;
}

function bearerToken(request: Request) {
  const value = request.headers.get('authorization');
  return value?.startsWith('Bearer ') ? value.slice(7).trim() : null;
}

function decodeJson<T>(value: string): T {
  try { return JSON.parse(new TextDecoder().decode(base64UrlBytes(value))) as T; }
  catch { throw jsonError('Token inválido.', 401); }
}

function base64UrlBytes(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { 'content-type': 'application/json' } });
}
