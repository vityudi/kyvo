import { useState } from "react";
import { criarConta, editarConta, type Conta } from "../apiContas";
import { Modal } from "./Modal";

interface Props {
  conta: Conta | null;
  onFechar: () => void;
  onSalvo: () => void;
}

export function ContaFormModal({ conta, onFechar, onSalvo }: Props) {
  const editando = conta !== null;
  const [nome, setNome] = useState(conta?.nome ?? "");
  const [saldoInicial, setSaldoInicial] = useState(conta ? String(conta.saldo_inicial) : "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) {
      setErro("Informe um nome para a conta.");
      return;
    }
    const saldoInicialNumerico = saldoInicial.trim() ? Number(saldoInicial.replace(",", ".")) : 0;
    if (Number.isNaN(saldoInicialNumerico)) {
      setErro("Informe um saldo inicial válido.");
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      if (editando) {
        await editarConta(conta.id, { nome: nome.trim(), saldo_inicial: saldoInicialNumerico });
      } else {
        await criarConta({ nome: nome.trim(), saldo_inicial: saldoInicialNumerico });
      }
      onSalvo();
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo={editando ? "Editar conta" : "Nova conta"} onFechar={onFechar}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 p-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-text-secondary">Nome</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="ex.: Conta corrente"
            autoFocus
            className="rounded-[10px] border border-border-subtle bg-input-bg px-3 py-2 text-[13.5px] text-text-primary focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-text-secondary">Saldo inicial</span>
          <input
            value={saldoInicial}
            onChange={(e) => setSaldoInicial(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            className="rounded-[10px] border border-border-subtle bg-input-bg px-3 py-2 text-[13.5px] text-text-primary focus:outline-none"
          />
          <span className="text-[11px] text-text-tertiary">
            Quanto a conta já tinha antes de começar a registrar aqui. O saldo exibido soma isso às transações.
          </span>
        </label>

        {erro && <p className="text-[12.5px] text-danger">{erro}</p>}

        <button
          type="submit"
          disabled={salvando}
          className="mt-1 rounded-[10px] bg-accent px-3 py-2.5 text-[13.5px] font-bold text-accent-contrast transition disabled:opacity-60"
        >
          {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Criar conta"}
        </button>
      </form>
    </Modal>
  );
}
