// Copia texto para a área de transferência; cai para execCommand quando a
// Clipboard API não existe (http, WebView antiga).
export async function copyToClipboard(value: string, html?: string) {
  if (html && supportsRichClipboard()) {
    await navigator.clipboard.write([richItem(value, html)]);
    return true;
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  return execCommandCopy(value);
}

export type ClipboardPayload = { text: string; html?: string };

// Mesma cópia, mas para conteúdo que só fica pronto depois de buscar dados.
// O navegador exige que a escrita saia de dentro do gesto do usuário: esperar
// a rede antes de chamar `write()` derruba essa permissão (no lote de FSAs,
// "Copiar → Resumo para mensagem" falhava a partir de dois chamados, porque
// cada um faz uma ida ao Jira). Por isso o `write()` é disparado já com as
// promessas do conteúdo — a API aceita Promise em cada tipo MIME — e a espera
// acontece dentro dele, com o gesto ainda válido.
export async function copyToClipboardLazy(load: () => Promise<ClipboardPayload>) {
  if (supportsRichClipboard()) {
    const pending = load();
    // Falha de rede não pode virar promessa pendurada sem tratamento.
    pending.catch(() => {});
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': pending.then((payload) => blob(payload.text, 'text/plain')),
        'text/html': pending.then((payload) => blob(payload.html ?? payload.text, 'text/html')),
      }),
    ]);
    return true;
  }
  const payload = await load();
  return copyToClipboard(payload.text, payload.html);
}

function supportsRichClipboard() {
  return Boolean(navigator.clipboard?.write) && typeof ClipboardItem !== 'undefined';
}

function blob(value: string, type: string) {
  return new Blob([value], { type });
}

function richItem(value: string, html: string) {
  return new ClipboardItem({ 'text/plain': blob(value, 'text/plain'), 'text/html': blob(html, 'text/html') });
}

function execCommandCopy(value: string) {
  const field = document.createElement('textarea');
  field.value = value;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  return copied;
}
