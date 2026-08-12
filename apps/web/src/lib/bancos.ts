export interface Banco {
  key: string;
  label: string;
  /** Gradiente CSS (from -> to) usando as cores de marca reais do banco/bandeira. */
  gradiente: [string, string];
  corTexto: string;
}

// Cores de marca aproximadas dos bancos/fintechs mais usados no Brasil -
// so estetico (ver migration 0012_cartao_banco.sql), sem nenhum uso oficial
// de logo/identidade visual protegida, so a paleta de cor predominante.
export const BANCOS: Banco[] = [
  { key: "nubank", label: "Nubank", gradiente: ["#8A05BE", "#4E0273"], corTexto: "#ffffff" },
  { key: "itau", label: "Itaú", gradiente: ["#EC7000", "#FF9633"], corTexto: "#ffffff" },
  { key: "bradesco", label: "Bradesco", gradiente: ["#CC092F", "#7A0119"], corTexto: "#ffffff" },
  { key: "santander", label: "Santander", gradiente: ["#EC0000", "#8C0000"], corTexto: "#ffffff" },
  { key: "caixa", label: "Caixa", gradiente: ["#0033A0", "#003D82"], corTexto: "#ffffff" },
  { key: "bb", label: "Banco do Brasil", gradiente: ["#FFF200", "#003087"], corTexto: "#003087" },
  { key: "inter", label: "Inter", gradiente: ["#FF7A00", "#E65100"], corTexto: "#ffffff" },
  { key: "c6", label: "C6 Bank", gradiente: ["#242424", "#000000"], corTexto: "#ffffff" },
  { key: "picpay", label: "PicPay", gradiente: ["#21C25E", "#0E7A3A"], corTexto: "#ffffff" },
  { key: "will", label: "Will Bank", gradiente: ["#00E28A", "#00A868"], corTexto: "#003D2B" },
  { key: "outro", label: "Outro", gradiente: ["#4B5563", "#1F2937"], corTexto: "#ffffff" },
];

const MAPA = new Map(BANCOS.map((b) => [b.key, b]));

export function bancoPorChave(chave: string | null | undefined): Banco {
  return (chave && MAPA.get(chave)) || MAPA.get("outro")!;
}
