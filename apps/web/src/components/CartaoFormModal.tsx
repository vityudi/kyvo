import { useEffect, useState } from "react";
import { Check } from "@phosphor-icons/react";
import { criarCartao, editarCartao, type Cartao } from "../apiCartoes";
import { listarContas, type Conta } from "../apiContas";
import { BANCOS } from "../lib/bancos";
import { CartaoVisual } from "./CartaoVisual";
import { Dropdown } from "./Dropdown";
import { Modal } from "./Modal";

interface Props {
  cartao: Cartao | null;
  onFechar: () => void;
  onSalvo: () => void;
}

export function CartaoFormModal({ cartao, onFechar, onSalvo }: Props) {
  const editando = cartao !== null;
  const [nome, setNome] = useState(cartao?.nome ?? "");
  const [banco, setBanco] = useState(cartao?.banco ?? "outro");
  const [diaFechamento, setDiaFechamento] = useState(cartao ? String(cartao.dia_fechamento) : "");
  const [diaVencimento, setDiaVencimento] = useState(cartao ? String(cartao.dia_vencimento) : "");
  const [contas, setContas] = useState<Conta[]>([]);
  const [contaId, setContaId] = useState(cartao?.conta_id ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    listarContas()
      .then((lista) => {
        setContas(lista);
        if (!editando && lista.length > 0) setContaId((atual) => atual || lista[0]!.id);
      })
      .catch(() => setContas([]));
  }, [editando]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fechamento = Number(diaFechamento);
    const vencimento = Number(diaVencimento);
    if (!nome.trim()) {
      setErro("Informe um nome para o cartão.");
      return;
    }
    if (!fechamento || fechamento < 1 || fechamento > 31) {
      setErro("Informe um dia de fechamento válido (1-31).");
      return;
    }
    if (!vencimento || vencimento < 1 || vencimento > 31) {
      setErro("Informe um dia de vencimento válido (1-31).");
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      if (editando) {
        await editarCartao(cartao.id, { nome: nome.trim(), dia_fechamento: fechamento, dia_vencimento: vencimento, banco });
      } else {
        await criarCartao({
          nome: nome.trim(),
          dia_fechamento: fechamento,
          dia_vencimento: vencimento,
          conta_id: contaId || undefined,
          banco,
        });
      }
      onSalvo();
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo={editando ? "Editar cartão" : "Novo cartão"} onFechar={onFechar}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 p-5">
        <CartaoVisual
          nome={nome || "Meu cartão"}
          banco={banco}
          diaFechamento={Number(diaFechamento) || 0}
          diaVencimento={Number(diaVencimento) || 0}
          className="max-w-[280px] self-center"
        />

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-text-secondary">Nome</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="ex.: Nubank"
            autoFocus
            className="rounded-[10px] border border-border-subtle bg-input-bg px-3 py-2 text-[13.5px] text-text-primary focus:outline-none"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-text-secondary">Banco</span>
          <div className="flex flex-wrap gap-2">
            {BANCOS.map((b) => {
              const ativo = banco === b.key;
              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setBanco(b.key)}
                  title={b.label}
                  aria-label={b.label}
                  style={{ background: `linear-gradient(135deg, ${b.gradiente[0]}, ${b.gradiente[1]})` }}
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                    ativo ? "ring-2 ring-accent ring-offset-2 ring-offset-glass-popover" : "opacity-80 hover:opacity-100"
                  }`}
                >
                  {ativo && <Check size={13} weight="bold" color={b.corTexto} />}
                </button>
              );
            })}
          </div>
        </div>

        {!editando && contas.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-text-secondary">Conta</span>
            <Dropdown value={contaId} options={contas.map((c) => ({ value: c.id, label: c.nome }))} onChange={setContaId} />
          </div>
        )}

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-text-secondary">Dia de fechamento</span>
            <input
              value={diaFechamento}
              onChange={(e) => setDiaFechamento(e.target.value)}
              inputMode="numeric"
              placeholder="ex.: 25"
              className="rounded-[10px] border border-border-subtle bg-input-bg px-3 py-2 text-[13.5px] text-text-primary focus:outline-none"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-text-secondary">Dia de vencimento</span>
            <input
              value={diaVencimento}
              onChange={(e) => setDiaVencimento(e.target.value)}
              inputMode="numeric"
              placeholder="ex.: 5"
              className="rounded-[10px] border border-border-subtle bg-input-bg px-3 py-2 text-[13.5px] text-text-primary focus:outline-none"
            />
          </label>
        </div>

        {erro && <p className="text-[12.5px] text-danger">{erro}</p>}

        <button
          type="submit"
          disabled={salvando}
          className="mt-1 rounded-[10px] bg-accent px-3 py-2.5 text-[13.5px] font-bold text-accent-contrast transition disabled:opacity-60"
        >
          {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Criar cartão"}
        </button>
      </form>
    </Modal>
  );
}
