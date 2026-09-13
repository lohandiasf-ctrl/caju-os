import { isTicketKey, normalizeTicketKey } from "@/lib/ticket-links";

export async function GET(
  request: Request,
  context: { params: Promise<{ key: string }> },
) {
  const { key } = await context.params;
  const ticketKey = normalizeTicketKey(key);
  const url = new URL(request.url);
  url.pathname = "/";
  url.search = "";
  if (isTicketKey(ticketKey)) {
    url.searchParams.set("view", "tickets");
    url.searchParams.set("ticket", ticketKey);
  }
  return Response.redirect(url, 302);
}

