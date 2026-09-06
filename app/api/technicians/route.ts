import { asc, eq } from 'drizzle-orm';
import { technicians } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    const rows = await getDb().select({
      id: technicians.id, technicianExternalId: technicians.technicianExternalId, technicianCode: technicians.technicianCode,
      name: technicians.name, cpf: technicians.cpf, phone: technicians.phone, email: technicians.email, pixKey: technicians.pixKey,
      age: technicians.age, city: technicians.baseCity, state: technicians.baseState, fullAddress: technicians.fullAddress,
      sourceStatus: technicians.sourceStatus, status: technicians.status, approved: technicians.approved, onboardingCompleted: technicians.onboardingCompleted,
      hasVehicle: technicians.hasVehicle, vehicleType: technicians.vehicleType, alternativeTransport: technicians.alternativeTransport,
      servesOtherCities: technicians.servesOtherCities, extraCities: technicians.extraCities, toolsCount: technicians.toolsCount,
      availableTools: technicians.availableTools, specialtiesCount: technicians.specialtiesCount, specialties: technicians.specialties,
    }).from(technicians).orderBy(asc(technicians.name)).all();
    return Response.json({ technicians: rows }, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar os técnicos.' }, { status: 500 });
  }
}
