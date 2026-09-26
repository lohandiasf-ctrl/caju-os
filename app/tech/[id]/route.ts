export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const url = new URL(request.url);
  url.pathname = "/";
  url.search = "";
  if (id) {
    url.searchParams.set("view", "technicians");
    url.searchParams.set("tech", id);
  }
  return Response.redirect(url, 302);
}
