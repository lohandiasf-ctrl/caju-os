import { asc } from 'drizzle-orm';
import { technicianReviews, technicians } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    const db = getDb();
    const [rows, reviews] = await Promise.all([
      db.select({
        id: technicians.id, technicianExternalId: technicians.technicianExternalId, technicianCode: technicians.technicianCode,
        name: technicians.name, cpf: technicians.cpf, phone: technicians.phone, email: technicians.email, pixKey: technicians.pixKey,
        age: technicians.age, city: technicians.baseCity, state: technicians.baseState, fullAddress: technicians.fullAddress,
        sourceStatus: technicians.sourceStatus, status: technicians.status, approved: technicians.approved, onboardingCompleted: technicians.onboardingCompleted,
        hasVehicle: technicians.hasVehicle, vehicleType: technicians.vehicleType, alternativeTransport: technicians.alternativeTransport,
        servesOtherCities: technicians.servesOtherCities, extraCities: technicians.extraCities, toolsCount: technicians.toolsCount,
        availableTools: technicians.availableTools, specialtiesCount: technicians.specialtiesCount, specialties: technicians.specialties,
      }).from(technicians).orderBy(asc(technicians.name)).all(),
      db.select({ technicianId: technicianReviews.technicianId, rating: technicianReviews.rating }).from(technicianReviews).all(),
    ]);
    const stats = new Map<number, { sum: number; count: number }>();
    for (const review of reviews) {
      const current = stats.get(review.technicianId) ?? { sum: 0, count: 0 };
      current.sum += review.rating;
      current.count += 1;
      stats.set(review.technicianId, current);
    }
    const techniciansWithHistory = rows.map((row) => {
      const history = stats.get(row.id);
      return { ...row, reviewCount: history?.count ?? 0, reviewAvg: history ? history.sum / history.count : null };
    });
    return Response.json({ technicians: techniciansWithHistory }, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar os técnicos.' }, { status: 500 });
  }
}
