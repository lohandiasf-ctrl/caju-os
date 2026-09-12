import { auth } from '../firebase';

export const API_BASE = 'https://operacoes.cajutech.net';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * As 44 rotas do Cloudflare Workers autenticam por ID token do Firebase
 * (lib/server/firebase-auth.ts). O app nativo é só mais um cliente delas.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new ApiError('Sessão expirada. Entre de novo.', 401);
  const token = await user.getIdToken();

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  });

  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    const message = (payload as { error?: string } | null)?.error
      ?? `Falha na requisição (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
