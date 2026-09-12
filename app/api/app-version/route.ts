export async function GET() {
  return Response.json({ version: '0.1.15', releasedAt: '2026-09-12', downloadUrl: '/downloads/Caju-OS-0.1.15-x64-setup.exe' }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
