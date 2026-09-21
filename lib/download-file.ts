// Salva um arquivo gerado na tela. No app desktop o WebView grava direto na
// pasta Downloads sem mostrar nada; a tela usa o texto devolvido para avisar
// onde o arquivo foi parar.
//
// O link entra no DOM antes do clique e o blob só é liberado depois: revogar
// logo após o clique pode cancelar o download no WebView.
export function saveFile(blob: Blob, name: string): string {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return `Arquivo salvo na pasta Downloads: ${name}`;
}
