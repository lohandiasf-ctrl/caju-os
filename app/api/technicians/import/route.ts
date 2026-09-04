import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { getDb } from '@/db';
import { technicians } from '@/db/schema';

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    if (!['gerencia', 'analista'].includes(user.role)) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    const body = await request.json() as { rows?: Array<Record<string, unknown>> };
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length || rows.length > 5000) return NextResponse.json({ error: 'Envie entre 1 e 5000 técnicos.' }, { status: 400 });
    const db = getDb(); const now = new Date().toISOString(); let imported = 0;
    for (const row of rows) {
      const name = String(row.name ?? '').trim(); const city = String(row.city ?? '').trim(); const state = String(row.state ?? '').trim();
      if (!name || !city || !state) continue;
      const email = String(row.email ?? '').trim().toLowerCase() || null;
      await db.insert(technicians).values({ name, email, phone: String(row.phone ?? '').trim() || null, baseCity: city, baseState: state, status: 'offline', approved: Boolean(row.approved), createdAt: now }).onConflictDoUpdate({ target: technicians.email, set: { name, phone: String(row.phone ?? '').trim() || null, baseCity: city, baseState: state, approved: Boolean(row.approved) } }); imported++;
    }
    return NextResponse.json({ imported });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao importar técnicos.' }, { status: 500 }); }
}
