import { MESES } from "../lib/tempo";
import { Dropdown } from "./Dropdown";

interface Props {
  /** Data em formato ISO "YYYY-MM-DD". */
  value: string;
  onChange: (value: string) => void;
}

function diasNoMes(mes: number, ano: number): number {
  return new Date(ano, mes + 1, 0).getDate();
}

function paraIso(dia: number, mes: number, ano: number): string {
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

const OPCOES_MES = MESES.map((nome, i) => ({ value: i, label: nome }));

/** Seletor de data com o mesmo padrao visual do Dropdown (dia/mes/ano), no lugar do <input type="date"> generico do navegador. */
export function DataInput({ value, onChange }: Props) {
  const data = value ? new Date(`${value}T00:00:00`) : new Date();
  const dia = data.getDate();
  const mes = data.getMonth();
  const ano = data.getFullYear();

  function atualizar(novoDia: number, novoMes: number, novoAno: number) {
    const diaAjustado = Math.min(novoDia, diasNoMes(novoMes, novoAno));
    onChange(paraIso(diaAjustado, novoMes, novoAno));
  }

  const opcoesDia = Array.from({ length: diasNoMes(mes, ano) }, (_, i) => ({ value: i + 1, label: String(i + 1) }));

  const anoAtual = new Date().getFullYear();
  const anoMinimo = Math.min(anoAtual, ano) - 6;
  const anoMaximo = Math.max(anoAtual, ano) + 1;
  const opcoesAno = Array.from({ length: anoMaximo - anoMinimo + 1 }, (_, i) => anoMaximo - i).map((a) => ({
    value: a,
    label: String(a),
  }));

  return (
    <div className="flex gap-2">
      <Dropdown className="w-[76px] shrink-0" value={dia} options={opcoesDia} onChange={(d) => atualizar(d, mes, ano)} />
      <Dropdown className="min-w-0 flex-1" value={mes} options={OPCOES_MES} onChange={(m) => atualizar(dia, m, ano)} />
      <Dropdown className="w-[92px] shrink-0" value={ano} options={opcoesAno} onChange={(a) => atualizar(dia, mes, a)} />
    </div>
  );
}
