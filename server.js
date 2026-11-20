const http = require("http");
const crypto = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 3000);
const TOKEN = process.env.BB_TOKEN;

if (!TOKEN || TOKEN.length < 32) {
  throw new Error("Set BB_TOKEN to a random secret of at least 32 characters.");
}

let browser = null;
const pending = new Map();
const allowedActions = new Set(["get_page_info", "get_dom", "get_links"]);

function authorized(value) {
  if (typeof value !== "string") return false;
  const a = Buffer.from(value);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function reply(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return reply(res, 200, {
      status: "online",
      browserConnected: !!browser && browser.readyState === WebSocket.OPEN
    });
  }

  if (req.method !== "POST" || req.url !== "/api/command") {
    return reply(res, 404, { error: "Not found" });
  }

  if (!authorized(req.headers.authorization?.replace(/^Bearer\s+/i, ""))) {
    return reply(res, 401, { error: "Unauthorized" });
  }

  let body = "";
  req.on("data", chunk => {
    body += chunk;
    if (body.length > 8192) {
      reply(res, 413, { error: "Request too large" });
      req.destroy();
    }
  });

  req.on("end", async () => {
    if (res.writableEnded) return;

    let input;
    try {
      input = JSON.parse(body || "{}");
    } catch {
      return reply(res, 400, { error: "Invalid JSON" });
    }

    if (!allowedActions.has(input.action)) {
      return reply(res, 400, { error: "Unsupported action" });
    }

    if (!browser || browser.readyState !== WebSocket.OPEN) {
      return reply(res, 503, { error: "No browser connected" });
    }

    const id = crypto.randomUUID();

    try {
      const data = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("Browser command timed out"));
        }, 15000);

        pending.set(id, { resolve, reject, timer });
        browser.send(JSON.stringify({ type: "command", id, action: input.action }));
      });

      reply(res, 200, { type: "result", id, data });
    } catch (error) {
      reply(res, 504, { error: error.message });
    }
  });
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    socket.destroy();
    return;
  }

  if (url.pathname !== "/browser" || !authorized(url.searchParams.get("token"))) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws));
});

wss.on("connection", ws => {
  if (browser && browser.readyState === WebSocket.OPEN) browser.close();
  browser = ws;

  ws.on("message", raw => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type !== "result" || typeof message.id !== "string") return;
      const entry = pending.get(message.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(message.id);
      entry.resolve(message.data);
    } catch {
      // Ignore malformed client messages.
    }
  });

  ws.on("close", () => {
    if (browser === ws) browser = null;
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      pending.delete(id);
      entry.reject(new Error("Browser disconnected"));
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("BrowserBridge listening on port " + PORT);
});
