export async function GET() {
  return Response.json({ key: process.env.GOOGLE_MAPS_API_KEY || '' }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
