/**
 * Micro-router su `node:http`. Nessun framework.
 *
 * Il progetto ha già pagato due volte il prezzo di un framework scelto da
 * altri: Lovable per la piattaforma e TanStack Start per le server function,
 * che in React Native semplicemente non esistono. Qui non c'è niente da
 * sostituire il giorno che si cambia idea: sono cinquanta righe di Node.
 *
 * Fornisce: instradamento per metodo+percorso, corpo JSON con limite di
 * dimensione, CORS, gestione uniforme degli errori.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

export type Handler = (body: unknown, req: IncomingMessage) => Promise<unknown>;

/** Errore con status HTTP esplicito: tutto il resto diventa 500. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const MAX_BODY_BYTES = 8 * 1024 * 1024; // le foto dei piani importati arrivano in base64

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, "Corpo della richiesta troppo grande"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new HttpError(400, "JSON non valido"));
      }
    });
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * CORS aperto in sviluppo, ristretto in produzione tramite ALLOWED_ORIGINS
 * (elenco separato da virgole). Le app native non inviano Origin, quindi non
 * sono toccate: la restrizione serve solo a impedire che un sito qualunque
 * usi questo backend — e quindi la nostra chiave Gemini — dal browser.
 */
function applyCors(req: IncomingMessage, res: ServerResponse) {
  const allowed = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.origin;
  if (allowed.length === 0) res.setHeader("Access-Control-Allow-Origin", "*");
  else if (origin && allowed.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export function createApp() {
  const routes = new Map<string, Handler>();

  function route(method: string, path: string, handler: Handler) {
    routes.set(`${method} ${path}`, handler);
  }

  const app = {
    get: (path: string, h: Handler) => route("GET", path, h),
    post: (path: string, h: Handler) => route("POST", path, h),

    listen(port: number) {
      const server = createServer(async (req, res) => {
        applyCors(req, res);
        if (req.method === "OPTIONS") {
          res.writeHead(204);
          return res.end();
        }

        const path = (req.url ?? "/").split("?")[0].replace(/\/+$/, "") || "/";
        const handler = routes.get(`${req.method} ${path}`);
        if (!handler) return send(res, 404, { error: `Nessuna rotta per ${req.method} ${path}` });

        const started = Date.now();
        try {
          const body = req.method === "POST" ? await readJson(req) : {};
          const out = await handler(body, req);
          console.info(`${req.method} ${path} 200 ${Date.now() - started}ms`);
          send(res, 200, out);
        } catch (err) {
          const status = err instanceof HttpError ? err.status : 500;
          const message = err instanceof Error ? err.message : "Errore sconosciuto";
          console.error(`${req.method} ${path} ${status} ${Date.now() - started}ms — ${message}`);
          // Un 500 non espone il dettaglio interno: potrebbe contenere
          // frammenti di richiesta o indizi sulla configurazione.
          send(res, status, {
            error: status === 500 ? "Errore interno del server" : message,
          });
        }
      });
      server.listen(port, () => console.info(`spesa-smart-api in ascolto su :${port}`));
      return server;
    },
  };

  return app;
}
