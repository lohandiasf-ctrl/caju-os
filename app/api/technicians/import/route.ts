import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { getDb } from '@/db';
import { technicians } from '@/db/schema';
import { acharNoCadastro, type TecnicoDoCadastro } from '@/lib/technician-identity';

type Valores = typeof technicians.$inferInsert;

/**
 * Importa a planilha de técnicos.
 *
 * Antes a importação casava o técnico só pelo e-mail. Quem não tem e-mail —
 * metade do cadastro — virava uma linha nova a cada planilha, e o cadastro
 * chegou a 1.794 linhas para ~900 pessoas. Agora cada linha é procurada pela
 * mesma regra que unificou o cadastro (CPF com nome, depois e-mail, depois nome
 * e cidade) e atualiza o técnico que já existe.
 *
 * A mesma pessoa repetida dentro da planilha também vira um técnico só: é daí
 * que vinham as pessoas com oito cópias.
 */
export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    if (!['gerencia', 'analista'].includes(user.role)) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    const body = await request.json() as { rows?: Array<Record<string, unknown>> };
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length || rows.length > 5000) return NextResponse.json({ error: 'Envie entre 1 e 5000 técnicos.' }, { status: 400 });
    const db = getDb(); const now = new Date().toISOString();

    const existentes = await db
      .select({ id: technicians.id, name: technicians.name, cpf: technicians.cpf, email: technicians.email, baseCity: technicians.baseCity, createdAt: technicians.createdAt })
      .from(technicians)
      .all();
    // O cadastro que a planilha vai encontrando: os que já existem e os que ela
    // mesma cria. Os novos ganham id negativo provisório até serem inseridos.
    const cadastro: TecnicoDoCadastro[] = [...existentes];
    const emailsEmUso = new Map(existentes.filter((t) => t.email).map((t) => [t.email!.toLowerCase(), t.id]));
    const atualizar = new Map<number, Omit<Valores, 'createdAt'>>();
    const inserir = new Map<number, Valores>();
    let provisorio = -1;
    let novos = 0;
    let atualizados = 0;

    for (const row of rows) {
      const name = text(row.name); const city = text(row.city); const state = text(row.state);
      if (!name || !city || !state) continue;
      const email = text(row.email).toLowerCase() || null;
      const values: Valores = {
        technicianExternalId: nullable(row.technicianExternalId), technicianCode: nullable(row.technicianCode), name, cpf: nullable(row.cpf),
        email, phone: nullable(row.phone), pixKey: nullable(row.pixKey), age: nullable(row.age), baseCity: city, baseState: state,
        fullAddress: nullable(row.fullAddress), status: 'offline' as const, sourceStatus: nullable(row.sourceStatus), approved: Boolean(row.approved),
        onboardingCompleted: nullable(row.onboardingCompleted), hasVehicle: nullable(row.hasVehicle), vehicleType: nullable(row.vehicleType),
        alternativeTransport: nullable(row.alternativeTransport), servesOtherCities: nullable(row.servesOtherCities), extraCities: nullable(row.extraCities),
        toolsCount: nullable(row.toolsCount), availableTools: nullable(row.availableTools), specialtiesCount: nullable(row.specialtiesCount), specialties: nullable(row.specialties), createdAt: now,
      };

      const achado = acharNoCadastro(cadastro, { name, cpf: values.cpf, email, city });
      // E-mail é único: se ele já é de outro técnico, esta linha não o leva.
      const donoDoEmail = email ? emailsEmUso.get(email) : undefined;
      const semEmailAlheio = donoDoEmail !== undefined && donoDoEmail !== achado?.id ? { ...values, email: null } : values;

      if (achado && achado.id > 0) {
        const { createdAt: _createdAt, ...update } = semEmailAlheio;
        // Campo vazio na planilha não apaga o que o cadastro já tem.
        atualizar.set(achado.id, { ...atualizar.get(achado.id), ...semNulos(update) } as Omit<Valores, 'createdAt'>);
        if (update.email) emailsEmUso.set(update.email, achado.id);
        atualizados++;
      } else if (achado) {
        inserir.set(achado.id, { ...inserir.get(achado.id)!, ...semNulos(semEmailAlheio) } as Valores);
      } else {
        const id = provisorio--;
        inserir.set(id, semEmailAlheio);
        cadastro.push({ id, name, cpf: values.cpf ?? null, email: semEmailAlheio.email ?? null, baseCity: city, createdAt: now });
        if (semEmailAlheio.email) emailsEmUso.set(semEmailAlheio.email, id);
        novos++;
      }
    }

    const statements = [
      ...[...atualizar].map(([id, set]) => db.update(technicians).set(set).where(eq(technicians.id, id))),
      ...[...inserir.values()].map((values) => db.insert(technicians).values(values)),
    ];
    // D1 batches avoid one network round-trip per technician. Keep each batch small
    // enough for the platform statement limit while still making CSV imports quick.
    for (let index = 0; index < statements.length; index += 100) {
      const batch = statements.slice(index, index + 100);
      if (batch.length) await db.batch(batch as [typeof batch[number], ...typeof batch]);
    }
    return NextResponse.json({ imported: novos + atualizados, novos, atualizados });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao importar técnicos.' }, { status: 500 }); }
}

function text(value: unknown) { return String(value ?? '').trim(); }
function nullable(value: unknown) { const valueText = text(value); return valueText || null; }
function semNulos<T extends Record<string, unknown>>(valores: T): Partial<T> {
  return Object.fromEntries(Object.entries(valores).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;
}
