import type { FastifyInstance } from "fastify";
import { listarCategorias } from "../db/categoria.js";
import {
  consultarTransacoes,
  editarTransacao,
  excluirTransacao,
  registrarDespesa,
  registrarReceita,
  resumoPeriodo,
} from "../db/transacao.js";
import { obterUsuarioUnico } from "../db/usuario.js";

interface ConsultarTransacoesQuery {
  data_inicio: string;
  data_fim: string;
  tipo?: "despesa" | "receita" | "todos";
  categoria?: string;
  limite?: string;
  offset?: string;
}

interface CriarTransacaoBody {
  tipo: "despesa" | "receita";
  valor: number;
  categoria?: string;
  fonte?: string;
  descricao?: string;
  data?: string;
  hora?: string;
  cartao_id?: string;
}

interface EditarTransacaoBody {
  valor?: number;
  categoria?: string;
  fonte?: string;
  descricao?: string;
  data?: string;
  hora?: string;
}

interface ResumoQuery {
  data_inicio: string;
  data_fim: string;
  agrupar_por?: "categoria" | "conta" | "dia" | "nenhum";
}

/**
 * Rotas do painel web para o CRUD manual de transacoes e o resumo do
 * dashboard. Chamam exatamente as mesmas funcoes de db/transacao.ts usadas
 * pelo dispatcher de tools do assistente (lib/tools.ts) - garante que o que
 * e lancado pelo chat aparece aqui e vice-versa, sem nenhuma camada extra de
 * sincronizacao. Produto e single-tenant hoje (obterUsuarioUnico), entao o
 * painel nao precisa de seletor de usuario.
 */
export async function transacoesRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: ConsultarTransacoesQuery }>("/web/api/transacoes", async (request) => {
    const usuario = await obterUsuarioUnico();
    const { data_inicio, data_fim, tipo, categoria, limite, offset } = request.query;
    return consultarTransacoes(usuario.id, {
      data_inicio,
      data_fim,
      tipo,
      categoria,
      limite: limite ? Number(limite) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  });

  app.post<{ Body: CriarTransacaoBody }>("/web/api/transacoes", async (request, reply) => {
    const { tipo, valor, categoria, fonte, descricao, data, hora, cartao_id } = request.body;
    const usuario = await obterUsuarioUnico();

    try {
      if (tipo === "despesa") {
        if (!categoria) {
          return reply.code(400).send({ ok: false, erro: "informe a categoria da despesa" });
        }
        return await registrarDespesa(usuario.id, { valor, categoria, descricao: descricao ?? "", data, hora, cartao_id });
      }

      if (!fonte) {
        return reply.code(400).send({ ok: false, erro: "informe a fonte da receita" });
      }
      return await registrarReceita(usuario.id, { valor, fonte, descricao, data, hora });
    } catch (err) {
      return reply.code(400).send({ ok: false, erro: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put<{ Params: { transacaoId: string }; Body: EditarTransacaoBody }>(
    "/web/api/transacoes/:transacaoId",
    async (request, reply) => {
      const usuario = await obterUsuarioUnico();
      try {
        return await editarTransacao(usuario.id, { transacao_id: request.params.transacaoId, ...request.body });
      } catch (err) {
        return reply.code(400).send({ ok: false, erro: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  app.delete<{ Params: { transacaoId: string } }>("/web/api/transacoes/:transacaoId", async (request, reply) => {
    const usuario = await obterUsuarioUnico();
    try {
      return await excluirTransacao(usuario.id, request.params.transacaoId);
    } catch (err) {
      return reply.code(404).send({ ok: false, erro: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get<{ Querystring: { tipo?: "despesa" | "receita" } }>("/web/api/categorias", async (request) => {
    const usuario = await obterUsuarioUnico();
    return listarCategorias(usuario.id, request.query.tipo);
  });

  app.get<{ Querystring: ResumoQuery }>("/web/api/dashboard/resumo", async (request) => {
    const usuario = await obterUsuarioUnico();
    const { data_inicio, data_fim, agrupar_por } = request.query;
    return resumoPeriodo(usuario.id, { data_inicio, data_fim, agrupar_por });
  });
}
