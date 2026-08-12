import { useEffect, useState } from "react";
import {
  criarTransacao,
  editarTransacao,
  listarCategoriasFinancas,
  type Transacao,
  type TipoTransacao,
} from "../apiFinancas";
import { listarCartoes, type Cartao } from "../apiCartoes";
import { DataInput } from "./DataInput";
import { Dropdown } from "./Dropdown";
import { HoraInput } from "./HoraInput";
import { Modal } from "./Modal";

const NENHUM_CARTAO = "";

interface Props {
  transacao: Transacao | null;
  onFechar: () => void;
  onSalvo: () => void;
}

function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function horaAgora(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function horaDe(dataHoraIso: string): string {
  const d = new Date(dataHoraIso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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
  const [hora, setHora] = useState(transacao ? horaDe(transacao.data_hora) : horaAgora());
  const [categorias, setCategorias] = useState<string[]>([]);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [cartaoId, setCartaoId] = useState<string>(NENHUM_CARTAO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    listarCartoes()
      .then(setCartoes)
      .catch(() => setCartoes([]));
  }, []);

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
          hora,
        });
      } else {
        await criarTransacao({
          tipo,
          valor: valorNumerico,
          categoria: tipo === "despesa" ? categoria : undefined,
          fonte: tipo === "receita" ? fonte : undefined,
          descricao: descricao || undefined,
          data,
          hora,
          cartao_id: tipo === "despesa" && cartaoId ? cartaoId : undefined,
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
            Despesa
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
            Receita
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 p-5">
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

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-text-secondary">Data</span>
            <DataInput value={data} onChange={setData} />
          </div>
          <div className="flex w-[92px] shrink-0 flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-text-secondary">Hora</span>
            <HoraInput value={hora} onChange={setHora} />
          </div>
        </div>

        {!editando && tipo === "despesa" && cartoes.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-text-secondary">Cartão de crédito</span>
            <Dropdown
              value={cartaoId}
              options={[{ value: NENHUM_CARTAO, label: "Nenhum (dinheiro/débito/pix)" }, ...cartoes.map((c) => ({ value: c.id, label: c.nome }))]}
              onChange={setCartaoId}
            />
          </div>
        )}

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
