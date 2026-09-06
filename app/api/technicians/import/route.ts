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
    const statements = [];
    for (const row of rows) {
      const name = text(row.name); const city = text(row.city); const state = text(row.state);
      if (!name || !city || !state) continue;
      const email = text(row.email).toLowerCase() || null;
      const values = {
        technicianExternalId: nullable(row.technicianExternalId), technicianCode: nullable(row.technicianCode), name, cpf: nullable(row.cpf),
        email, phone: nullable(row.phone), pixKey: nullable(row.pixKey), age: nullable(row.age), baseCity: city, baseState: state,
        fullAddress: nullable(row.fullAddress), status: 'offline' as const, sourceStatus: nullable(row.sourceStatus), approved: Boolean(row.approved),
        onboardingCompleted: nullable(row.onboardingCompleted), hasVehicle: nullable(row.hasVehicle), vehicleType: nullable(row.vehicleType),
        alternativeTransport: nullable(row.alternativeTransport), servesOtherCities: nullable(row.servesOtherCities), extraCities: nullable(row.extraCities),
        toolsCount: nullable(row.toolsCount), availableTools: nullable(row.availableTools), specialtiesCount: nullable(row.specialtiesCount), specialties: nullable(row.specialties), createdAt: now,
      };
      const { createdAt: _createdAt, ...updateValues } = values;
      statements.push(db.insert(technicians).values(values).onConflictDoUpdate({ target: technicians.email, set: updateValues })); imported++;
    }
    // D1 batches avoid one network round-trip per technician. Keep each batch small
    // enough for the platform statement limit while still making CSV imports quick.
    for (let index = 0; index < statements.length; index += 100) {
      const batch = statements.slice(index, index + 100);
      if (batch.length) await db.batch(batch as [typeof batch[number], ...typeof batch]);
    }
    return NextResponse.json({ imported });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao importar técnicos.' }, { status: 500 }); }
}

function text(value: unknown) { return String(value ?? '').trim(); }
function nullable(value: unknown) { const valueText = text(value); return valueText || null; }
