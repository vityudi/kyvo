import { Plus } from "@phosphor-icons/react";

interface Props {
  podeIniciarConversa: boolean;
  criandoConversa: boolean;
  onNovaConversa: () => void;
}

/**
 * Barra superior fixa acima da lista de conversas + area de mensagens -
 * sempre visivel, independente de qual usuario/conversa esta selecionado.
 * Nao substitui a nav lateral (logo/config): e um espaco adicional. Ponto de
 * extensao futuro: seletor de provedor de LLM ativo, indicador de status de
 * conexao, etc, entram aqui ao lado do botao de nova conversa.
 */
export function AppHeader({ podeIniciarConversa, criandoConversa, onNovaConversa }: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
      <div className="flex-1" />

      <button
        onClick={onNovaConversa}
        disabled={!podeIniciarConversa || criandoConversa}
        title={podeIniciarConversa ? undefined : "Abra um chat na lateral para começar uma nova conversa com o mesmo contato"}
        className="flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-contrast transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus size={15} weight="bold" />
        {criandoConversa ? "Criando…" : "Nova conversa"}
      </button>
    </header>
  );
}
