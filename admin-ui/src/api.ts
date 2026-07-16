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
  const resposta = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

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
  usuarioId: string;
  telegramChatId: number;
  ultimaMensagem: string;
  ultimaRole: "user" | "assistant";
  ultimaEm: string;
  totalMensagens: number;
}

export interface MensagemAdmin {
  id: string;
  role: "user" | "assistant";
  conteudo: string;
  criadoEm: string;
}

export function listarConversas(): Promise<ConversaResumo[]> {
  return request("/admin/api/conversas");
}

export function carregarMensagens(usuarioId: string, antes?: string, limite = 50): Promise<MensagemAdmin[]> {
  const params = new URLSearchParams({ limite: String(limite) });
  if (antes) params.set("antes", antes);
  return request(`/admin/api/conversas/${usuarioId}/mensagens?${params}`);
}

export function enviarMensagem(usuarioId: string, texto: string): Promise<{ resposta: string }> {
  return request(`/admin/api/conversas/${usuarioId}/mensagens`, {
    method: "POST",
    body: JSON.stringify({ texto }),
  });
}
