import { useEffect, useState } from "react";
import {
  criarTransacao,
  editarTransacao,
  listarCategoriasFinancas,
  type Transacao,
  type TipoTransacao,
} from "../apiFinancas";
import { DataInput } from "./DataInput";
import { Dropdown } from "./Dropdown";
import { Modal } from "./Modal";

interface Props {
  transacao: Transacao | null;
  onFechar: () => void;
  onSalvo: () => void;
}

function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TransacaoFormModal({ transacao, onFechar, onSalvo }: Props) {
  const editando = transacao !== null;
  const [tipo, setTipo] = useState<TipoTransacao>(transacao?.tipo ?? "despesa");
  const [valor, setValor] = useState(transacao ? String(transacao.valor) : "");
  const [categoria, setCategoria] = useState(transacao?.categoria ?? "");
  const [fonte, setFonte] = useState(transacao?.fonte ?? "");
  const [descricao, setDescricao] = useState(transacao?.descricao ?? "");
  // `transacao.data` vem do backend como timestamp completo - cortamos os 10
  // primeiros caracteres pra ficar so a data (YYYY-MM-DD).
  const [data, setData] = useState(transacao?.data.slice(0, 10) ?? hoje());
  const [categorias, setCategorias] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Fonte da receita tambem usa a lista de categorias conhecidas (tipo
  // receita), no mesmo dropdown padronizado da categoria de despesa - mantem
  // os dois rotulos ("Categoria" pra despesa, "Fonte" pra receita) mas com o
  // mesmo controle visual.
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
        await editarTransacao(transacao.id, {
          valor: valorNumerico,
          categoria: tipo === "despesa" ? categoria : undefined,
          descricao: descricao || undefined,
          data,
        });
      } else {
        await criarTransacao({
          tipo,
          valor: valorNumerico,
          categoria: tipo === "despesa" ? categoria : undefined,
          fonte: tipo === "receita" ? fonte : undefined,
          descricao: descricao || undefined,
          data,
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
    <Modal titulo={editando ? "Editar transação" : "Nova transação"} onFechar={onFechar}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 p-5">
        {!editando && (
          <div className="flex gap-1 rounded-[12px] border border-border-subtle bg-glass-strong p-1">
            <button
              type="button"
              onClick={() => setTipo("despesa")}
              className={`flex-1 rounded-[9px] py-2 text-[13px] font-bold transition ${
                tipo === "despesa" ? "bg-danger/15 text-danger" : "text-text-secondary hover:bg-glass"
              }`}
            >
              Despesa
            </button>
            <button
              type="button"
              onClick={() => setTipo("receita")}
              className={`flex-1 rounded-[9px] py-2 text-[13px] font-bold transition ${
                tipo === "receita" ? "bg-success/15 text-success" : "text-text-secondary hover:bg-glass"
              }`}
            >
              Receita
            </button>
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-text-secondary">Valor</span>
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
          <span className="text-[12px] font-semibold text-text-secondary">Data</span>
          <DataInput value={data} onChange={setData} />
        </div>

        {erro && <p className="text-[12.5px] text-danger">{erro}</p>}

        <button
          type="submit"
          disabled={salvando}
          className="mt-1 rounded-[10px] bg-accent px-3 py-2.5 text-[13.5px] font-bold text-accent-contrast transition disabled:opacity-60"
        >
          {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Registrar transação"}
        </button>
      </form>
    </Modal>
  );
}
