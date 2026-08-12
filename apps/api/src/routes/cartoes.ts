import type { FastifyInstance } from "fastify";
import { criarCartao, desativarCartao, editarCartao, listarCartoes } from "../db/cartao.js";
import { listarFaturas, transacoesDaFatura, type StatusFatura } from "../db/fatura.js";
import { obterUsuarioUnico } from "../db/usuario.js";

interface CriarBody {
  nome: string;
  dia_fechamento: number;
  dia_vencimento: number;
  conta_id?: string;
  banco?: string;
}

interface EditarBody {
  nome?: string;
  dia_fechamento?: number;
  dia_vencimento?: number;
  banco?: string;
}

interface ListarFaturasQuery {
  status?: StatusFatura;
  limite?: string;
}

/**
 * Rotas do painel web para cartões e suas faturas - mesmas funções de
 * db/cartao.ts e db/fatura.ts usadas pelo dispatcher de tools do assistente
 * (ver lib/tools.ts), mesmo padrão de routes/lancamentosFuturos.ts.
 */
export async function cartoesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/web/api/cartoes", async () => {
    const usuario = await obterUsuarioUnico();
    return listarCartoes(usuario.id);
  });

  app.post<{ Body: CriarBody }>("/web/api/cartoes", async (request, reply) => {
    const usuario = await obterUsuarioUnico();
    try {
      return await criarCartao(usuario.id, request.body);
    } catch (err) {
      return reply.code(400).send({ ok: false, erro: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put<{ Params: { id: string }; Body: EditarBody }>("/web/api/cartoes/:id", async (request, reply) => {
    const usuario = await obterUsuarioUnico();
    try {
      return await editarCartao(usuario.id, { cartao_id: request.params.id, ...request.body });
    } catch (err) {
      return reply.code(400).send({ ok: false, erro: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete<{ Params: { id: string } }>("/web/api/cartoes/:id", async (request, reply) => {
    const usuario = await obterUsuarioUnico();
    try {
      return await desativarCartao(usuario.id, request.params.id);
    } catch (err) {
      return reply.code(404).send({ ok: false, erro: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get<{ Params: { id: string }; Querystring: ListarFaturasQuery }>(
    "/web/api/cartoes/:id/faturas",
    async (request) => {
      const usuario = await obterUsuarioUnico();
      const { status, limite } = request.query;
      return listarFaturas(usuario.id, { cartao_id: request.params.id, status, limite: limite ? Number(limite) : undefined });
    },
  );

  app.get<{ Params: { id: string } }>("/web/api/faturas/:id/transacoes", async (request) => {
    const usuario = await obterUsuarioUnico();
    return transacoesDaFatura(usuario.id, request.params.id);
  });
}
