import type { AuthorizedUser } from "@/lib/server/firebase-auth";
import { clientIp } from "@/lib/server/rate-limit";

const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /([?&](?:key|token|api_token|access_token|refresh_token)=)[^&\s]+/gi,
  /(JIRA_API_TOKEN|SPARES_SYNC_TOKEN|TURN_KEY_API_TOKEN|CLOUDFLARE_API_TOKEN)["':=\s]+[^"',\s]+/gi,
];

export function redactSensitive(value: unknown): unknown {
  if (typeof value === "string") {
    return secretPatterns.reduce(
      (text, pattern) => text.replace(pattern, (_match, prefix = "") => `${prefix}[redacted]`),
      value,
    );
  }
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      /token|secret|password|authorization|cookie|key/i.test(key) ? "[redacted]" : redactSensitive(item),
    ]),
  );
}

export function logSecurityEvent(input: {
  request: Request;
  user?: Pick<AuthorizedUser, "email" | "role"> | null;
  action: string;
  outcome: "allowed" | "denied" | "failed";
  details?: unknown;
}) {
  console.info("security_audit", {
    at: new Date().toISOString(),
    action: input.action,
    outcome: input.outcome,
    userEmail: input.user?.email ?? null,
    role: input.user?.role ?? null,
    method: input.request.method,
    path: new URL(input.request.url).pathname,
    ip: clientIp(input.request),
    details: redactSensitive(input.details ?? null),
  });
}

