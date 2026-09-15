export type ContactTechnician = {
  name: string;
  phone: string | null;
  city: string;
  state: string;
};

export const GOOGLE_CONTACTS_HEADER = [
  'First Name', 'Middle Name', 'Last Name', 'Phonetic First Name', 'Phonetic Middle Name', 'Phonetic Last Name', 'Name Prefix', 'Name Suffix', 'Nickname', 'File As', 'Organization Name', 'Organization Title', 'Organization Department', 'Birthday', 'Notes', 'Photo', 'Labels', 'Phone 1 - Label', 'Phone 1 - Value', 'Address 1 - Label', 'Address 1 - Formatted', 'Address 1 - Street', 'Address 1 - City', 'Address 1 - PO Box', 'Address 1 - Region', 'Address 1 - Postal Code', 'Address 1 - Country', 'Address 1 - Extended Address',
];

function titleCase(value: string) {
  return value.trim().toLocaleLowerCase('pt-BR').replace(/(^|[\s-])(\p{L})/gu, (_, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase('pt-BR')}`);
}

export function technicianShortName(name: string) {
  const words = titleCase(name).split(/\s+/).filter(Boolean);
  const particles = new Set(['De', 'Da', 'Do', 'Das', 'Dos', 'E']);
  let names = 0;
  const selected: string[] = [];
  for (const word of words) {
    selected.push(names > 0 && particles.has(word) ? word.toLocaleLowerCase('pt-BR') : word);
    if (!particles.has(word)) names += 1;
    if (names === 2) break;
  }
  return selected.join(' ');
}

export function brazilPhone(value: string | null) {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.startsWith('55') && [12, 13].includes(digits.length)) return `+${digits}`;
  if ([10, 11].includes(digits.length)) return `+55${digits}`;
  return '';
}

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// The technician registry has repeated records for the same person; a
// repeated phone, or the same full name in the same city, is one contact.
function uniqueContacts(technicians: ContactTechnician[]) {
  const seenPhones = new Set<string>();
  const seenPeople = new Set<string>();
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
  return technicians.filter((technician) => {
    const phone = brazilPhone(technician.phone);
    if (!phone) return false;
    const person = `${normalize(technician.name)}|${normalize(technician.city)}|${normalize(technician.state)}`;
    if (seenPhones.has(phone) || seenPeople.has(person)) return false;
    seenPhones.add(phone);
    seenPeople.add(person);
    return true;
  });
}

export function googleContactsCsv(technicians: ContactTechnician[], lastNumber: number) {
  const start = Number.isInteger(lastNumber) && lastNumber >= 0 ? lastNumber + 1 : 1;
  const rows = uniqueContacts(technicians)
    .map((technician, index) => {
      const sequence = String(start + index).padStart(4, '0');
      const display = `TCP - ${technicianShortName(technician.name)} (${titleCase(technician.city)}/${technician.state.trim().toUpperCase()}) | #TCP-${sequence}`;
      return [
        display, '', '', '', '', '', '', '', '', '', '', 'Técnico de Campo', '', '', '', '', 'TCP - Técnico Cadastrado na Plataforma ::: * myContacts', 'Mobile', brazilPhone(technician.phone), 'Work', '', '', titleCase(technician.city), '', technician.state.trim().toUpperCase(), '', 'Brasil', '',
      ];
    });
  return [GOOGLE_CONTACTS_HEADER, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
