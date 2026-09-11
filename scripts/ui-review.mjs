// Isolated visual review: synthetic data only; never signs in or writes to Jira.
// Usage: PLAYWRIGHT_MODULE=<path to playwright> node scripts/ui-review.mjs
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = 'http://localhost:3000';
const output = '.ui-review';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`${origin}/login`);
await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
await page.screenshot({ path: `${output}/login-desktop.png`, fullPage: true });
await page.setViewportSize({ width: 375, height: 812 });
await page.screenshot({ path: `${output}/login-mobile.png`, fullPage: true });
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Login overflows');
const now = new Date().toISOString();
const issues = ['AGENDAMENTO', 'AGENDADO', 'Aguardando Spare', 'DIRECIONADO', 'TEC-CAMPO'].map((status, i) => ({ key: `FSA-${900001 + i}`, summary: `Loja L${250 + i} | CPU com lentidão — diagnóstico e manutenção`, status, statusCategory: 'In Progress', priority: 'Medium', assignee: 'Ana Souza', updatedAt: now, createdAt: now, store: `L${250 + i}`, city: 'Salvador / BA', scheduledAt: now, partnerTriggeredAt: now }));
const technician = { id: 1, name: 'Ana Souza', city: 'Salvador', state: 'BA', status: 'Disponível', approved: true, phone: '', specialties: 'CPU e periféricos', availableTools: 'Multímetro', fullAddress: '', cpf: '', email: 'ana@example.invalid' };
const mock = {
  '/api/jira/issues': { issues, isLast: true },
  '/api/operational-dashboard': { metrics: { active: 5, overdue: 0, visits: 8, revenueCents: 240000, marginCents: 95000 }, alerts: [], validationQueue: [{ ticketKey: issues[4].key, submittedByName: 'Ana Souza', submittedByEmail: 'ana@example.invalid', submittedAt: now }], recentAudit: [], collaborators: [], n1: [] },
  '/api/operations': { archivedKeys: [], workflows: [], technicians: [technician], stores: [], visits: [], audit: [] },
  '/api/operations/intelligence': { requesters: [], shipments: [], tasks: [], snapshots: [], audit: [] },
  '/api/technicians': { technicians: [technician] },
  '/api/colleagues': { colleagues: [] },
  '/api/users/n1': { users: [{ email: 'ana@example.invalid', role: 'n1' }] },
  '/api/chat-groups': { groups: [] },
  '/api/messages': { messages: [] },
  '/api/communication-preferences': {},
  '/api/finance/rules': { firstTicketCents: 10000, additionalTicketCents: 7000 },
  '/api/jira/finance': { issues: issues.map(issue => ({ ...issue, title: issue.summary, technician: 'Ana Souza', serviceValue: 20000, spareValue: 12000, totalValue: 32000 })) },
  '/api/feedback': { items: [], feedback: [] },
  '/api/admin/jira-sync': { pending: 0, failed: 0, jobs: [] },
  '/api/bilhetes': { notes: [{ id: 1, authorName: 'Ana Souza', authorEmail: 'ana@example.invalid', targetName: 'Equipe', title: 'Alinhamento de campo', body: 'Confirmar disponibilidade do técnico antes de agendar a visita à loja.', createdAt: now }], canArchiveAny: true },
};
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin !== origin) return route.abort();
  if (url.pathname.includes('/components/auth-provider.tsx')) {
    const source = await (await route.fetch()).text();
    const reactPath = source.match(/from "([^"]*\/react\.js[^"]*)"/)?.[1];
    assert.ok(reactPath, 'React module path must come from Vite');
    return route.fulfill({ contentType: 'text/javascript', body: `import React from ${JSON.stringify(reactPath)}; import { CajuLoading } from '/components/caju-loading.tsx'; const user = { uid: 'ui-review', email: 'review@example.invalid', getIdToken: async () => 'synthetic-ui-review' }; export function useAuth() { return { user, role: 'gerencia', loading: false, accessError: '' }; } export function AuthProvider({ children }) { const [ready, setReady] = React.useState(false); React.useEffect(() => setReady(true), []); return ready ? children : React.createElement(CajuLoading, { label: 'Verificando acesso...' }); }` });
  }
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname.endsWith('/attachments/1')) return route.fulfill({ path: 'public/caju-tech-emblem.png', contentType: 'image/png' });
    let body = mock[url.pathname] || {};
    if (/^\/api\/jira\/issues\/FSA-\d+$/.test(url.pathname)) body = { ...issues.find(issue => url.pathname.endsWith(issue.key)), description: 'Chamado fictício para revisão visual.', reporter: 'Equipe de operações', issueType: 'Incidente', project: 'FSA', jiraUrl: 'https://example.invalid/browse/FSA-900001', operationalFields: { allegedDefect: 'Desktop da central lento e travando' }, attachments: [{ id: '1', filename: 'Evidência de teste.png', mimeType: 'image/png', size: 16000, createdAt: now, author: 'Ana Souza' }], internalComments: [] };
    return route.fulfill({ json: body });
  }
  return route.continue();
});
const report = [];
for (const width of (process.env.UI_WIDTHS || '375,768,1024,1440').split(',').map(Number)) {
  await page.setViewportSize({ width, height: 900 });
  for (const view of (process.env.UI_VIEWS || 'overview,tickets,agenda,central,technicians,projects,feedback,settings,mapa,spares,financeiro').split(',')) {
    const url = ['mapa', 'spares', 'financeiro'].includes(view) ? `/${view}` : `/?view=${view}`;
    await page.goto(`${origin}${url}`);
    await page.locator('#main-content').waitFor();
    await page.waitForTimeout(400);
    const check = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, heading: document.querySelector('h1')?.textContent, offenders: [...document.querySelectorAll('#main-content *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(el).position !== 'absolute').slice(0, 4).map(el => `${el.tagName}.${el.className}`) }));
    report.push({ width, view, ...check });
    if ([375, 1440].includes(width)) await page.screenshot({ path: `${output}/${view}-${width}.png`, fullPage: false });
    if (width === 1440 && view === 'overview') {
      for (const [label, path, heading] of [
        ['Mapa operacional', '/mapa', 'Mapa operacional de técnicos'],
        ['Spares', '/spares', 'Central de Spares'],
        ['Financeiro', '/financeiro', 'Financeiro'],
      ]) {
        await page.getByRole('link', { name: label, exact: true }).click();
        await page.waitForURL(`${origin}${path}`);
        await page.getByRole('heading', { name: heading, exact: true }).waitFor();
        await page.goto(`${origin}/?view=overview`);
        await page.locator('#main-content').waitFor();
      }
    }
    if (width === 375 && view === 'overview') {
      await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
      await page.getByRole('dialog', { name: 'Menu principal', exact: true }).waitFor();
      await page.screenshot({ path: `${output}/mobile-navigation.png` });
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: 'Menu principal', exact: true }).waitFor({ state: 'hidden' });
      assert.equal(await page.getByRole('dialog', { name: 'Menu principal', exact: true }).count(), 0);
    }
    if (view === 'overview' && [375, 1440].includes(width)) {
      await page.getByRole('button', { name: 'Novo bilhete', exact: true }).click();
      await page.getByLabel('Para quem', { exact: true }).fill('Equipe');
      await page.getByRole('button', { name: 'Fechar formulário' }).click();
      await page.getByRole('button').filter({ hasText: 'FSA-900001' }).first().click();
      await page.getByText('Desktop da central lento e travando', { exact: true }).waitFor();
      await page.getByRole('tab', { name: /Anexos/ }).click();
      const ticketDialog = page.getByRole('dialog').last();
      await page.screenshot({ path: `${output}/ticket-attachments-${width}.png` });
      const overflowing = await ticketDialog.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, children: [...el.children].map(child => ({ tag: child.tagName, class: child.className, width: child.offsetWidth, scroll: child.scrollWidth, rect: child.getBoundingClientRect().toJSON(), wideChildren: [...child.children].filter(n => n.scrollWidth > n.clientWidth + 1).slice(0, 5).map(n => ({ tag: n.tagName, class: n.className, width: n.clientWidth, scroll: n.scrollWidth, rect: n.getBoundingClientRect().toJSON() })) })), descendants: [...el.querySelectorAll('*')].filter(child => child.getBoundingClientRect().right > el.getBoundingClientRect().right + 1).slice(0, 8).map(child => ({ tag: child.tagName, class: child.className, text: child.textContent?.slice(0, 55), rect: child.getBoundingClientRect().toJSON() })) }));
      if (overflowing.scroll > overflowing.width + 1) console.log(JSON.stringify(overflowing));
      assert.equal(overflowing.scroll > overflowing.width + 1, false, 'Ticket dialog overflows');
      await page.getByRole('button', { name: 'Visualizar Evidência de teste.png', exact: true }).click();
      await page.getByRole('button', { name: 'Fechar visualização' }).waitFor();
      await page.screenshot({ path: `${output}/attachment-preview-${width}.png` });
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Fechar visualização' }).waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: /Gerir operação/ }).click();
      await page.getByRole('button', { name: 'Salvar operação', exact: true }).waitFor();
      const save = await page.getByRole('button', { name: 'Salvar operação', exact: true }).boundingBox();
      assert.ok(save && save.y >= 0 && save.y + save.height <= 900, 'Save must remain inside viewport');
      await page.screenshot({ path: `${output}/operation-${width}.png` });
    }
  }
}
await writeFile(`${output}/report.json`, JSON.stringify({ errors, report }, null, 2));
console.log(JSON.stringify({ errors, checked: report.length, failures: report.filter(item => item.overflow) }, null, 2));
assert.equal(errors.length, 0, 'Browser runtime errors');
assert.equal(report.some(item => item.overflow), false, 'A page overflows horizontally');
} finally { await browser.close(); }
