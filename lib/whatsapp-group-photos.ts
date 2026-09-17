// Photos a new WhatsApp group can start with. The files live in
// public/whatsapp-group-photos/<id>.jpg (640×640); the bridge downloads the
// chosen one from Caju OS and sets it as the group picture.
export const WHATSAPP_GROUP_PHOTOS = [
  { id: 'atendimento-agendado', label: 'Atendimento agendado' },
  { id: 'agendar-com-tecnico', label: 'Agendar com técnico' },
  { id: 'tecnico-em-atendimento', label: 'Técnico em atendimento' },
  { id: 'retorno-ao-atendimento', label: 'Retorno ao atendimento' },
  { id: 'pendencia-tecnica', label: 'Pendência técnica' },
] as const;

export type WhatsappGroupPhotoId = (typeof WHATSAPP_GROUP_PHOTOS)[number]['id'];

// Every group gets a photo; this one unless someone picks another.
export const DEFAULT_WHATSAPP_GROUP_PHOTO: WhatsappGroupPhotoId = 'agendar-com-tecnico';

export function whatsappGroupPhotoSrc(id: WhatsappGroupPhotoId) {
  return `/whatsapp-group-photos/${id}.jpg`;
}

export function isWhatsappGroupPhoto(value: unknown): value is WhatsappGroupPhotoId {
  return WHATSAPP_GROUP_PHOTOS.some((photo) => photo.id === value);
}
