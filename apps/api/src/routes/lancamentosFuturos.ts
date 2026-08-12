import type { FastifyInstance } from "fastify";
import {
  cancelarLancamentoFuturo,
  confirmarLancamentoFuturo,
  criarLancamentoFuturo,
  editarLancamentoFuturo,
  listarLancamentosFuturos,
  type StatusLancamentoFuturo,
} from "../db/lancamentoFuturo.js";
import { obterUsuarioUnico } from "../db/usuario.js";

interface ListarQuery {
  status?: StatusLancamentoFuturo;
  tipo?: "despesa" | "receita";
  limite?: string;
}

interface CriarBody {
  tipo: "despesa" | "receita";
  valor: number;
  categoria?: string;
  fonte?: string;
  descricao?: string;
  data_prevista: string;
  hora?: string;
  recorrencia?: "diaria" | "semanal" | "mensal" | "anual";
  repeticoes?: number;
  conta_id?: string;
}

interface EditarBody {
  valor?: number;
  categoria?: string;
  descricao?: string;
  data_prevista?: string;
  hora?: string;
}

interface ConfirmarBody {
  valor?: number;
  data?: string;
  hora?: string;
}

/**
 * Rotas do painel web para lançamentos futuros - mesmas funções de
 * db/lancamentoFuturo.ts usadas pelo dispatcher de tools do assistente (ver
 * lib/tools.ts), mesmo padrão de routes/transacoes.ts.
 */
export async function lancamentosFuturosRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: ListarQuery }>("/web/api/lancamentos-futuros", async (request) => {
    const usuario = await obterUsuarioUnico();
    const { status, tipo, limite } = request.query;
    return listarLancamentosFuturos(usuario.id, { status, tipo, limite: limite ? Number(limite) : undefined });
  });

  app.post<{ Body: CriarBody }>("/web/api/lancamentos-futuros", async (request, reply) => {
    const usuario = await obterUsuarioUnico();
    try {
      return await criarLancamentoFuturo(usuario.id, request.body);
    } catch (err) {
      return reply.code(400).send({ ok: false, erro: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put<{ Params: { id: string }; Body: EditarBody }>("/web/api/lancamentos-futuros/:id", async (request, reply) => {
    const usuario = await obterUsuarioUnico();
    try {
      return await editarLancamentoFuturo(usuario.id, { lancamento_id: request.params.id, ...request.body });
    } catch (err) {
      return reply.code(400).send({ ok: false, erro: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post<{ Params: { id: string }; Body: ConfirmarBody }>(
    "/web/api/lancamentos-futuros/:id/confirmar",
    async (request, reply) => {
      const usuario = await obterUsuarioUnico();
      try {
        return await confirmarLancamentoFuturo(usuario.id, { lancamento_id: request.params.id, ...request.body });
      } catch (err) {
        return reply.code(400).send({ ok: false, erro: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  app.delete<{ Params: { id: string } }>("/web/api/lancamentos-futuros/:id", async (request, reply) => {
    const usuario = await obterUsuarioUnico();
    try {
      return await cancelarLancamentoFuturo(usuario.id, request.params.id);
    } catch (err) {
      return reply.code(404).send({ ok: false, erro: err instanceof Error ? err.message : String(err) });
    }
  });
}
