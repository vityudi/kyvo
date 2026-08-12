import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Le a ADMIN_PASSWORD direto do .env da API (nao ha um jeito melhor de
 * compartilhar isso entre os dois workspaces) pra poder injetar o header
 * Basic Auth no proxy abaixo - sem isso, toda chamada de API em dev cairia
 * no prompt de login nativo do navegador, que trava fetch/XHR.
 */
function lerAdminPassword(): string | undefined {
  try {
    const caminho = fileURLToPath(new URL("../api/.env", import.meta.url));
    const conteudo = readFileSync(caminho, "utf-8");
    const linha = conteudo.split("\n").find((l) => l.trim().startsWith("ADMIN_PASSWORD="));
    return linha?.split("=").slice(1).join("=").trim();
  } catch {
    return undefined;
  }
}

const adminPassword = lerAdminPassword();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/",
  build: {
    outDir: "dist",
  },
  server: {
    proxy: {
      // API, uploads e SSE do painel - tudo que o front chama fica sob /web,
      // servido em producao pelo mesmo processo Fastify (ver apps/api/src/routes/admin.ts).
      "/web": {
        target: "http://localhost:3000",
        changeOrigin: true,
        configure: (proxy) => {
          if (!adminPassword) return;
          const auth = Buffer.from(`admin:${adminPassword}`).toString("base64");
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("Authorization", `Basic ${auth}`);
          });
        },
      },
    },
  },
});
