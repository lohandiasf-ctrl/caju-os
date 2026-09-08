export type Technician = {
  id: number;
  name: string;
  baseCity: string;
  baseState: string;
  extraCities?: string | null;
  status: 'online' | 'busy' | 'break' | 'offline';
  specialties?: string | null;
  availableTools?: string | null;
  hasVehicle?: string | null;
  vehicleType?: string | null;
  rating?: number;
  latitude?: number | null;
  longitude?: number | null;
};

export type TicketDispatchReq = {
  storeCity: string;
  storeState: string;
  storeLat?: number | null;
  storeLng?: number | null;
  category: string;
  requiredTools?: string[];
  priority: 'low' | 'medium' | 'high';
  clientValueCents: number;
  technicianPayoutCents: number;
};

export type TechnicianScoreResult = {
  technician: Technician;
  totalScore: number;
  breakdown: {
    distance: number;
    availability: number;
    specialties: number;
    performance: number;
    tools: number;
    transport: number;
    profitability: number;
  };
  reasons: string[];
};

export function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function rankBestTechnicians(technicians: Technician[], ticket: TicketDispatchReq): TechnicianScoreResult[] {
  return technicians.map((tech) => {
    let distanceScore = 0;
    let availabilityScore = 0;
    let specialtyScore = 0;
    let performanceScore = 0;
    let toolsScore = 0;
    let transportScore = 0;
    let profitabilityScore = 0;
    const reasons: string[] = [];

    // 1. Distância & Região (máx 25 pts)
    const isSameCity = tech.baseCity.toLowerCase().trim() === ticket.storeCity.toLowerCase().trim();
    const servesExtra = tech.extraCities?.toLowerCase().includes(ticket.storeCity.toLowerCase());

    if (tech.latitude && tech.longitude && ticket.storeLat && ticket.storeLng) {
      const km = calculateHaversineDistance(tech.latitude, tech.longitude, ticket.storeLat, ticket.storeLng);
      if (km <= 15) { distanceScore = 25; reasons.push(`Próximo (${km.toFixed(1)} km)`); }
      else if (km <= 40) { distanceScore = 18; reasons.push(`Distância moderada (${km.toFixed(1)} km)`); }
      else if (km <= 80) { distanceScore = 10; }
      else { distanceScore = 5; }
    } else if (isSameCity) {
      distanceScore = 25;
      reasons.push(`Mesma cidade base (${tech.baseCity})`);
    } else if (servesExtra) {
      distanceScore = 18;
      reasons.push(`Atende cidade extra (${ticket.storeCity})`);
    }

    // 2. Disponibilidade (máx 20 pts)
    if (tech.status === 'online') { availabilityScore = 20; reasons.push('Técnico Online'); }
    else if (tech.status === 'break') { availabilityScore = 10; reasons.push('Em pausa temporária'); }
    else if (tech.status === 'busy') { availabilityScore = 5; }
    else { availabilityScore = 0; }

    // 3. Especialidades (máx 15 pts)
    const techSpecs = (tech.specialties || '').toLowerCase();
    const categoryMatch = techSpecs.includes(ticket.category.toLowerCase());
    if (categoryMatch) {
      specialtyScore = 15;
      reasons.push(`Especialista em ${ticket.category}`);
    } else if (techSpecs.length > 0) {
      specialtyScore = 8;
    }

    // 4. Histórico de Desempenho (máx 15 pts)
    const rating = tech.rating || 4.0;
    performanceScore = Math.round((rating / 5.0) * 15);
    if (rating >= 4.5) reasons.push(`Excelente avaliação (${rating.toFixed(1)}★)`);

    // 5. Ferramentas Necessárias (máx 10 pts)
    const techTools = (tech.availableTools || '').toLowerCase();
    const reqTools = ticket.requiredTools || [];
    const hasAllTools = reqTools.every(t => techTools.includes(t.toLowerCase()));
    if (hasAllTools && reqTools.length > 0) {
      toolsScore = 10;
      reasons.push('Possui todas as ferramentas necessárias');
    } else {
      toolsScore = 6;
    }

    // 6. Custo & Meio de Deslocamento (máx 10 pts)
    if (tech.hasVehicle?.toLowerCase() === 'sim') {
      transportScore = 10;
      reasons.push(`Veículo próprio (${tech.vehicleType || 'Carro/Moto'})`);
    } else {
      transportScore = 5;
    }

    // 7. Prioridade & Lucro (máx 5 pts)
    const margin = ticket.clientValueCents - ticket.technicianPayoutCents;
    if (margin > 5000) {
      profitabilityScore = 5;
      reasons.push('Alta margem operacional');
    } else {
      profitabilityScore = 3;
    }

    const totalScore = distanceScore + availabilityScore + specialtyScore + performanceScore + toolsScore + transportScore + profitabilityScore;

    return {
      technician: tech,
      totalScore,
      breakdown: { distance: distanceScore, availability: availabilityScore, specialties: specialtyScore, performance: performanceScore, tools: toolsScore, transport: transportScore, profitability: profitabilityScore },
      reasons,
    };
  }).sort((a, b) => b.totalScore - a.totalScore);
}
