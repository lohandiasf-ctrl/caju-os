// Abre um link fora do sistema. Nunca navega a janela atual: no WebView do app
// desktop isso substitui o Caju OS pela página aberta, sem barra de endereço
// nem botão de voltar — o usuário fica preso e precisa fechar o programa.
//
// No desktop, o comando `open_external_url` só libera Jira e grupos do
// WhatsApp; qualquer outro link (a planilha do SharePoint, por exemplo) cai no
// plano B: janela nova do navegador e, se o navegador bloquear, 'blocked' para
// a tela avisar e oferecer o link.
export async function openExternalUrl(url: string): Promise<'opened' | 'blocked'> {
  if (typeof window === 'undefined') return 'blocked';
  if ('__TAURI_INTERNALS__' in window) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_external_url', { url });
      return 'opened';
    } catch {
      // Link fora da lista permitida pelo app: tenta o navegador abaixo.
    }
  }
  try {
    return window.open(url, '_blank', 'noopener,noreferrer') ? 'opened' : 'blocked';
  } catch {
    return 'blocked';
  }
}
