// Pure helpers for the spreadsheet pull, kept out of `lib/server/spares-sync.ts`
// so they can be unit tested — that module imports `cloudflare:workers`, which
// does not resolve under `node --test`.

// Power Automate's "List rows present in a table" answers with only its first
// page — 256 rows — unless Pagination is switched on in the action's settings.
// The truncation is silent: the flow still returns HTTP 200, so a sync that
// imported 256 of 381 rows reported success and the spares past that point
// looked like they had never been added to the spreadsheet. Landing exactly on
// one of these sizes is the only signal the connector gives that there is more
// table behind the response.
const CONNECTOR_DEFAULT_PAGE_SIZES = new Set([256, 512, 1000, 2048, 5000]);

export function looksTruncated(received: number) {
  return received > 0 && CONNECTOR_DEFAULT_PAGE_SIZES.has(received);
}

// The spreadsheet held ~381 rows when this was last reviewed; the headroom is
// for growth, and going over it now reports a warning instead of silently
// dropping the tail the way the connector's own page limit did.
export const MAX_PULL_ROWS = 5000;
