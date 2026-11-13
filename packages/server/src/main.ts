import Fastify from "fastify";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, createReadStream } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBlankProject } from "@age/model";
import { agentConfigFromEnv } from "@age/agent";
import { providerFromEnv } from "@age/assets";
import { SqliteStore } from "./db";
import { Sessions, type Client } from "./session";
import { StarterKit, demoProject } from "./starter";
import type { ClientMessage, ServerMessage } from "./protocol";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..", "..");
const env = process.env;

const dataDir = resolve(env.DATA_DIR ?? join(root, "data"));
const port = Number(env.PORT ?? 8787);
const host = env.HOST ?? "0.0.0.0";

const store = new SqliteStore(dataDir);
const kit = new StarterKit(store);
const hasKey = !!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
const anthropic = hasKey ? new Anthropic(env.ANTHROPIC_API_KEY ? { authToken: null } : {}) : null;
const provider = env.IMAGE_GENERATION === "off" ? null : providerFromEnv(env);
const agent = agentConfigFromEnv(env);

const app = Fastify({ logger: { level: env.LOG_LEVEL ?? "warn" }, bodyLimit: 8 * 1024 * 1024 });
const sessions = new Sessions({ store, kit, provider, anthropic, agent, log: (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`) });

await app.register(websocket, { options: { maxPayload: 24 * 1024 * 1024 } });

app.get("/api/health", async () => ({ ok: true, ai: !!anthropic, images: !!provider, model: agent.model, starter: kit.available }));

app.post("/api/projects", async (req) => {
  const body = (req.body ?? {}) as { template?: string; name?: string };
  const doc = body.template === "demo" && kit.available ? demoProject(kit) : createBlankProject(typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : "새 프로젝트");
  return { id: sessions.create(doc) };
});

app.get("/api/projects/:id", async (req, reply) => {
  const s = sessions.get((req.params as { id: string }).id);
  if (!s) return reply.code(404).send({ error: "not found" });
  return { ok: true };
});

app.get("/assets/:file", async (req, reply) => {
  const file = (req.params as { file: string }).file;
  let path: string;
  try {
    path = store.assetPath(file);
  } catch {
    return reply.code(400).send({ error: "bad name" });
  }
  if (!existsSync(path)) return reply.code(404).send({ error: "not found" });
  // 파일 이름이 내용 해시라 바뀌지 않는다
  return reply.header("cache-control", "public, max-age=31536000, immutable").type("image/png").send(createReadStream(path));
});

app.get("/ws/:id", { websocket: true }, (socket, req) => {
  const session = sessions.get((req.params as { id: string }).id);
  if (!session) {
    socket.close(4404, "project not found");
    return;
  }
  const client: Client = {
    send(msg: ServerMessage) {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    },
  };
  session.join(client);
  socket.on("message", (raw: Buffer) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    try {
      session.handle(client, msg);
    } catch (e) {
      client.send({ t: "error", message: e instanceof Error ? e.message : String(e) });
    }
  });
  socket.on("close", () => session.leave(client));
});

// 빌드된 편집기를 같이 내보낸다 (개발 중에는 Vite 가 대신한다)
const dist = join(root, "packages", "editor", "dist");
if (existsSync(dist)) {
  await app.register(fastifyStatic, { root: dist, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === "GET" && !req.url.startsWith("/api") && !req.url.startsWith("/assets") && !req.url.startsWith("/ws")) return reply.sendFile("index.html");
    return reply.code(404).send({ error: "not found" });
  });
}

await app.listen({ port, host });
console.log(`server on http://localhost:${port}  ai=${anthropic ? agent.model : "off"}  images=${provider ? "on" : "off"}  data=${dataDir}`);

for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    void app.close().then(() => {
      store.close();
      process.exit(0);
    });
  });
