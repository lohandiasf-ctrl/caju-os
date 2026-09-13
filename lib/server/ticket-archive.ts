import { ticketArchives } from '@/db/schema';
import type { getDb } from '@/db';

export type TicketArchiveInput = {
  ticketKey: string;
  title?: string | null;
  jiraStatus?: string | null;
  operationalStatus?: string | null;
  storeName?: string | null;
  city?: string | null;
  snapshot: Record<string, unknown>;
  actorEmail: string;
  reason: string;
  capturedAt?: string;
};

/**
 * Upserts the last known complete ticket state. It is deliberately invoked on
 * meaningful workflow/Jira changes, not from polling, to avoid turning the
 * live Jira queue into a high-write cache.
 */
export async function captureTicketArchive(db: ReturnType<typeof getDb>, input: TicketArchiveInput) {
  const now = input.capturedAt ?? new Date().toISOString();
  const ticketKey = input.ticketKey.trim().toUpperCase();
  const title = clean(input.title) ?? ticketKey;
  const values = {
    ticketKey,
    title,
    jiraStatus: clean(input.jiraStatus),
    operationalStatus: clean(input.operationalStatus),
    storeName: clean(input.storeName),
    city: clean(input.city),
    snapshot: JSON.stringify(input.snapshot),
    capturedAt: now,
    capturedBy: input.actorEmail,
    captureReason: input.reason.slice(0, 500),
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(ticketArchives).values(values).onConflictDoUpdate({
    target: ticketArchives.ticketKey,
    set: {
      title: values.title,
      jiraStatus: values.jiraStatus,
      operationalStatus: values.operationalStatus,
      storeName: values.storeName,
      city: values.city,
      snapshot: values.snapshot,
      capturedAt: values.capturedAt,
      capturedBy: values.capturedBy,
      captureReason: values.captureReason,
      updatedAt: values.updatedAt,
    },
  });
}

function clean(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim().slice(0, 400) || null : null;
}
