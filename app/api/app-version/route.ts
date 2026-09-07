export async function GET() {
  return Response.json({ version: '0.1.13', releasedAt: '2026-09-06', downloadUrl: '/downloads/Caju-OS-0.1.13-x64-setup.exe' }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
