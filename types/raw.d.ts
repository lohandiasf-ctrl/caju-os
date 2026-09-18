// `?raw` traz o conteúdo do arquivo como string no bundle. Usado para o
// diretório de técnicos, que o servidor precisa ler sem ir à rede.
declare module '*?raw' {
  const content: string;
  export default content;
}
