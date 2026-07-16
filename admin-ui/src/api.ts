export type LlmProvider = "anthropic" | "deepseek";

export interface ProvedorResumo {
  provider: LlmProvider;
  modelo: string;
  ativo: boolean;
  chaveConfigurada: boolean;
  atualizadoEm: string;
}

interface ApiOk {
  ok: true;
}

interface ApiErro {
  ok: false;
  erro: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // FormData define seu proprio Content-Type (com boundary) - nao sobrescrever.
  const headers = init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers };

  const resposta = await fetch(path, { ...init, headers });

  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => null)) as ApiErro | null;
    throw new Error(corpo?.erro ?? `erro ${resposta.status}`);
  }

  return resposta.json() as Promise<T>;
}

export function listarProvedores(): Promise<ProvedorResumo[]> {
  return request("/admin/api/providers");
}

export function salvarProvedor(provider: LlmProvider, modelo: string, apiKey?: string): Promise<ApiOk> {
  return request(`/admin/api/providers/${provider}`, {
    method: "PUT",
    body: JSON.stringify({ modelo, apiKey: apiKey || undefined }),
  });
}

export function ativarProvedor(provider: LlmProvider): Promise<ApiOk> {
  return request(`/admin/api/providers/${provider}/ativar`, { method: "POST" });
}

export function testarProvedor(provider: LlmProvider): Promise<ApiOk | ApiErro> {
  return request<ApiOk | ApiErro>(`/admin/api/providers/${provider}/testar`, { method: "POST" }).catch(
    (err: Error): ApiErro => ({ ok: false, erro: err.message }),
  );
}

export interface ConversaResumo {
  id: string;
  usuarioId: string;
  telegramChatId: number;
  titulo: string | null;
  status: "ativa" | "arquivada";
  ultimaMensagem: string | null;
  ultimaRole: "user" | "assistant" | null;
  ultimaEm: string;
  totalMensagens: number;
}

export type TipoAnexo = "imagem" | "audio" | "documento";

export interface Anexo {
  id: string;
  tipo: TipoAnexo;
  mimeType: string;
  nomeArquivo: string | null;
  tamanhoBytes: number | null;
  transcricao: string | null;
}

export interface MensagemAdmin {
  id: string;
  role: "user" | "assistant";
  conteudo: string;
  criadoEm: string;
  anexos: Anexo[];
}

export interface Conversa {
  id: string;
  usuarioId: string;
  titulo: string | null;
  status: "ativa" | "arquivada";
}

export function listarConversas(): Promise<ConversaResumo[]> {
  return request("/admin/api/conversas");
}

export function criarConversa(usuarioId: string): Promise<Conversa> {
  return request(`/admin/api/usuarios/${usuarioId}/conversas`, { method: "POST" });
}

export function carregarMensagens(conversaId: string, antes?: string, limite = 50): Promise<MensagemAdmin[]> {
  const params = new URLSearchParams({ limite: String(limite) });
  if (antes) params.set("antes", antes);
  return request(`/admin/api/conversas/${conversaId}/mensagens?${params}`);
}

export function enviarMensagem(conversaId: string, texto: string, arquivo?: File): Promise<{ resposta: string }> {
  if (arquivo) {
    const formData = new FormData();
    formData.set("texto", texto);
    formData.set("arquivo", arquivo);
    return request(`/admin/api/conversas/${conversaId}/mensagens`, { method: "POST", body: formData });
  }

  return request(`/admin/api/conversas/${conversaId}/mensagens`, {
    method: "POST",
    body: JSON.stringify({ texto }),
  });
}

export function urlAnexo(anexoId: string): string {
  return `/admin/api/anexos/${anexoId}`;
}
