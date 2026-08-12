import { useEffect, useState } from "react";
import { criarLancamentoFuturo, editarLancamentoFuturo, type LancamentoFuturo, type Recorrencia } from "../apiLancamentosFuturos";
import { listarCategoriasFinancas, type TipoTransacao } from "../apiFinancas";
import { DataInput } from "./DataInput";
import { Dropdown } from "./Dropdown";
import { Modal } from "./Modal";
import { RepeticoesInput } from "./RepeticoesInput";

interface Props {
  lancamento: LancamentoFuturo | null;
  onFechar: () => void;
  onSalvo: () => void;
}

function amanha(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const OPCOES_RECORRENCIA: { value: Recorrencia | ""; label: string }[] = [
  { value: "", label: "Não se repete" },
  { value: "mensal", label: "Todo mês" },
  { value: "semanal", label: "Toda semana" },
  { value: "anual", label: "Todo ano" },
  { value: "diaria", label: "Todo dia" },
];

export function LancamentoFuturoFormModal({ lancamento, onFechar, onSalvo }: Props) {
  const editando = lancamento !== null;
  const [tipo, setTipo] = useState<TipoTransacao>(lancamento?.tipo ?? "despesa");
  const [valor, setValor] = useState(lancamento ? String(lancamento.valor) : "");
  const [categoria, setCategoria] = useState(lancamento?.categoria ?? "");
  const [fonte, setFonte] = useState(lancamento?.fonte ?? "");
  const [descricao, setDescricao] = useState(lancamento?.descricao ?? "");
  const [dataPrevista, setDataPrevista] = useState(lancamento?.data_prevista.slice(0, 10) ?? amanha());
  const [recorrencia, setRecorrencia] = useState<Recorrencia | "">(lancamento?.recorrencia ?? "");
  const [repeticoes, setRepeticoes] = useState(lancamento?.repeticoes_restantes ?? 0);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    listarCategoriasFinancas(tipo)
      .then(setCategorias)
      .catch(() => setCategorias([]));
  }, [tipo]);

  useEffect(() => {
    if (categorias.length === 0) return;
    if (tipo === "despesa" && !categorias.includes(categoria)) setCategoria(categorias[0]!);
    if (tipo === "receita" && !categorias.includes(fonte)) setFonte(categorias[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorias, tipo]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valorNumerico = Number(valor.replace(",", "."));
    if (!valorNumerico || valorNumerico <= 0) {
      setErro("Informe um valor válido.");
      return;
    }
    if (tipo === "despesa" && !categoria) {
      setErro("Informe a categoria.");
      return;
    }
    if (tipo === "receita" && !fonte) {
      setErro("Informe a fonte da receita.");
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      if (editando) {
        await editarLancamentoFuturo(lancamento.id, {
          valor: valorNumerico,
          categoria: tipo === "despesa" ? categoria : undefined,
          descricao: descricao || undefined,
          data_prevista: dataPrevista,
        });
      } else {
        await criarLancamentoFuturo({
          tipo,
          valor: valorNumerico,
          categoria: tipo === "despesa" ? categoria : undefined,
          fonte: tipo === "receita" ? fonte : undefined,
          descricao: descricao || undefined,
          data_prevista: dataPrevista,
          recorrencia: recorrencia || undefined,
          repeticoes: recorrencia && repeticoes > 0 ? repeticoes : undefined,
        });
      }
      onSalvo();
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  }

  const opcoesCategoria = categorias.map((c) => ({ value: c, label: c }));

  return (
    <Modal titulo={editando ? "Editar lançamento futuro" : "Novo lançamento futuro"} onFechar={onFechar}>
      {!editando && (
        <div className="flex gap-1 border-b border-border-subtle px-5">
          <button
            type="button"
            onClick={() => setTipo("despesa")}
            className={`rounded-t-[10px] px-4 py-2.5 text-[13px] font-bold transition ${
              tipo === "despesa"
                ? "border-b-2 border-danger text-danger"
                : "border-b-2 border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            Despesa futura
          </button>
          <button
            type="button"
            onClick={() => setTipo("receita")}
            className={`rounded-t-[10px] px-4 py-2.5 text-[13px] font-bold transition ${
              tipo === "receita"
                ? "border-b-2 border-success text-success"
                : "border-b-2 border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            Receita futura
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 p-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-text-secondary">Valor previsto</span>
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            className="rounded-[10px] border border-border-subtle bg-input-bg px-3 py-2 text-[13.5px] text-text-primary focus:outline-none"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-text-secondary">{tipo === "despesa" ? "Categoria" : "Fonte"}</span>
          {tipo === "despesa" ? (
            <Dropdown value={categoria} options={opcoesCategoria} onChange={setCategoria} />
          ) : (
            <Dropdown value={fonte} options={opcoesCategoria} onChange={setFonte} />
          )}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-text-secondary">Descrição</span>
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="opcional"
            className="rounded-[10px] border border-border-subtle bg-input-bg px-3 py-2 text-[13.5px] text-text-primary focus:outline-none"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-text-secondary">Data prevista</span>
          <DataInput value={dataPrevista} onChange={setDataPrevista} />
        </div>

        {!editando && (
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-text-secondary">Repetição</span>
              <Dropdown value={recorrencia} options={OPCOES_RECORRENCIA} onChange={setRecorrencia} />
            </div>
            <div className="flex w-[120px] shrink-0 flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-text-secondary">Quantas vezes</span>
              <RepeticoesInput value={repeticoes} onChange={setRepeticoes} disabled={!recorrencia} />
            </div>
          </div>
        )}

        {erro && <p className="text-[12.5px] text-danger">{erro}</p>}

        <button
          type="submit"
          disabled={salvando}
          className="mt-1 rounded-[10px] bg-accent px-3 py-2.5 text-[13.5px] font-bold text-accent-contrast transition disabled:opacity-60"
        >
          {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Criar lançamento futuro"}
        </button>
      </form>
    </Modal>
  );
}
