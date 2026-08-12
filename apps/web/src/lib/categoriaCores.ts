// Paleta categorica com hues bem distribuidos ao redor da roda de cores -
// evita repetir tons proximos (ex.: varios avermelhados/alaranjados juntos),
// que ficam dificeis de diferenciar. So um vermelho (b3341c) e um laranja
// (f97316) representados, ja bem separados em matiz.
const PALETA = [
  "#2563eb", // azul
  "#0f7a5c", // verde-agua
  "#f97316", // laranja
  "#8b5cf6", // roxo
  "#eab308", // amarelo/ambar
  "#0ea5e9", // ciano
  "#d6336c", // magenta
  "#65a30d", // verde-oliva
  "#b3341c", // vermelho
  "#6366f1", // indigo
];

function hash(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i++) {
    h = (h << 5) - h + texto.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Cor deterministica por nome de categoria (mesma categoria sempre cai na mesma cor da paleta). */
export function corCategoria(categoria: string): string {
  return PALETA[hash(categoria.toLowerCase()) % PALETA.length]!;
}

/** Cor de texto unica para todas as badges de categoria - clara no tema claro, escura no tema escuro (o fundo colorido varia, o texto nao). */
export function corTextoBadgeCategoria(escuro: boolean): string {
  return escuro ? "#0c0d0e" : "#ffffff";
}
