import type { FastifyInstance } from "fastify";
import { criarConta, editarConta, listarContas } from "../db/conta.js";
import { obterUsuarioUnico } from "../db/usuario.js";

interface CriarBody {
  nome: string;
  saldo_inicial?: number;
}

interface EditarBody {
  nome?: string;
  saldo_inicial?: number;
}

/**
 * Rotas do painel web para contas - mesmas funções de db/conta.ts usadas
 * pelo dispatcher de tools do assistente (ver lib/tools.ts), mesmo padrão
 * de routes/lancamentosFuturos.ts.
 */
export async function contasRoutes(app: FastifyInstance): Promise<void> {
  app.get("/web/api/contas", async () => {
    const usuario = await obterUsuarioUnico();
    return listarContas(usuario.id);
  });

  app.post<{ Body: CriarBody }>("/web/api/contas", async (request, reply) => {
    const usuario = await obterUsuarioUnico();
    try {
      return await criarConta(usuario.id, request.body);
    } catch (err) {
      return reply.code(400).send({ ok: false, erro: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put<{ Params: { id: string }; Body: EditarBody }>("/web/api/contas/:id", async (request, reply) => {
    const usuario = await obterUsuarioUnico();
    try {
      return await editarConta(usuario.id, { conta_id: request.params.id, ...request.body });
    } catch (err) {
      return reply.code(400).send({ ok: false, erro: err instanceof Error ? err.message : String(err) });
    }
  });
}
