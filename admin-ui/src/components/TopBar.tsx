import { PencilSimpleLine, SidebarSimple } from "@phosphor-icons/react";

interface Props {
  sidebarAberta: boolean;
  onAbrirSidebar: () => void;
  onNovaConversa: () => void;
}

/**
 * Faixa superior fina, no estilo OpenWebUI: so aparece com conteudo quando a
 * sidebar esta recolhida, expondo o botao pra reabri-la e um atalho de nova
 * conversa que normalmente vive dentro da sidebar.
 */
export function TopBar({ sidebarAberta, onAbrirSidebar, onNovaConversa }: Props) {
  if (sidebarAberta) {
    return <div className="h-3 shrink-0" />;
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 px-3">
      <button
        onClick={onAbrirSidebar}
        aria-label="Expandir barra lateral"
        title="Expandir barra lateral"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition hover:bg-surface-sunken"
      >
        <SidebarSimple size={18} />
      </button>
      <button
        onClick={onNovaConversa}
        aria-label="Nova conversa"
        title="Nova conversa"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition hover:bg-surface-sunken"
      >
        <PencilSimpleLine size={18} />
      </button>
      <div className="ml-2 flex h-6 w-6 items-center justify-center rounded-md bg-accent text-[11px] font-bold text-accent-contrast">
        K
      </div>
      <span className="text-sm font-semibold text-text-primary">Kyvo</span>
    </header>
  );
}
