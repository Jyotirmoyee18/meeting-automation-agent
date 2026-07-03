import dotenv from "dotenv";
import http from "http";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import meetingsRouter from "./routes/meetings";
import { handleWebSocketConnection } from "./websocket/handler";

dotenv.config();

// ─── Environment Validation ───────────────────────────────────────────────────

const REQUIRED_ENV: string[] = ["DEEPGRAM_API_KEY", "GEMINI_API_KEY"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(
    `\n[Startup] Missing required environment variables:\n  ${missing.join("\n  ")}`,
  );
  console.error(
    "\nCopy server/.env.example to server/.env and fill in the values.\n",
  );
  process.exit(1);
}

// ─── Express App ──────────────────────────────────────────────────────────────

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:3000";
const isProd = process.env.NODE_ENV === "production";

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/meetings", meetingsRouter);

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("[Express] Unhandled error:", err.message);
    res.status(500).json({
      error: isProd ? "Internal server error" : err.message,
    });
  },
);

// ─── HTTP + WebSocket Server ──────────────────────────────────────────────────

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  console.log("[WS] New connection");
  handleWebSocketConnection(ws);
});

wss.on("error", (err) => {
  console.error("[WSS] Server error:", err.message);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n[VoxNote] Server running on http://localhost:${PORT}`);
  console.log(`[VoxNote] WebSocket on  ws://localhost:${PORT}/ws`);
  console.log(`[VoxNote] CORS origin:  ${CLIENT_URL}\n`);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on("SIGTERM", () => {
  console.log("[VoxNote] SIGTERM received — shutting down...");
  wss.close();
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("[VoxNote] SIGINT received — shutting down...");
  wss.close();
  server.close(() => process.exit(0));
});
