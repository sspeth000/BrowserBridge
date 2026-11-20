(() => {
  if (window.__browserBridge?.socket?.readyState === WebSocket.OPEN) {
    alert("BrowserBridge is already connected.");
    return;
  }

  const host = prompt("BrowserBridge server hostname (without https://):");
  if (!host) return;

  const token = prompt("BrowserBridge access token:");
  if (!token) return;

  const hostname = host.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(hostname)) {
    alert("Invalid server hostname.");
    return;
  }

  const panel = document.createElement("section");
  panel.id = "browserbridge-panel";
  panel.style.cssText = "position:fixed;z-index:2147483647;top:12px;right:12px;left:12px;max-height:75vh;background:#171717;color:#fff;padding:14px;border:1px solid #777;border-radius:12px;font:14px system-ui;display:flex;flex-direction:column;gap:8px;box-shadow:0 5px 30px #0008";
  const heading = document.createElement("strong");
  heading.textContent = "BrowserBridge v0.2";
  const status = document.createElement("div");
  status.textContent = "Connecting…";
  const output = document.createElement("textarea");
  output.readOnly = true;
  output.style.cssText = "width:100%;height:180px;box-sizing:border-box;background:#242424;color:#b7ffb7;padding:8px";
  const close = document.createElement("button");
  close.textContent = "Disconnect";
  close.style.cssText = "padding:10px";
  panel.append(heading, status, output, close);
  document.documentElement.append(panel);

  const log = value => {
    output.value = (JSON.stringify(value, null, 2) + "\n\n" + output.value).slice(0, 12000);
  };

  const socket = new WebSocket(
    "wss://" + hostname + "/browser?token=" + encodeURIComponent(token)
  );
  window.__browserBridge = { socket, panel };

  close.onclick = () => {
    socket.close();
    panel.remove();
    delete window.__browserBridge;
  };

  socket.onopen = () => { status.textContent = "Connected"; };
  socket.onerror = () => { status.textContent = "Connection error"; };
  socket.onclose = () => { status.textContent = "Disconnected"; };

  socket.onmessage = event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type !== "command" || typeof message.id !== "string") return;

    let data;
    try {
      switch (message.action) {
        case "get_page_info":
          data = {
            title: document.title,
            url: location.href,
            description: document.querySelector('meta[name="description"]')?.content || "",
            visibleText: (document.body?.innerText || "").slice(0, 10000)
          };
          break;
        case "get_links":
          data = [...document.querySelectorAll("a[href]")]
            .slice(0, 100)
            .map(a => ({ text: (a.innerText || "").trim().slice(0, 150), url: a.href }));
          break;
        case "get_dom": {
          const clone = document.documentElement.cloneNode(true);
          clone.querySelectorAll("script,iframe,object,embed").forEach(node => node.remove());
          clone.querySelectorAll("input,textarea,select").forEach(node => {
            node.removeAttribute("value");
            node.textContent = "";
          });
          clone.querySelectorAll("[contenteditable=true]").forEach(node => {
            node.textContent = "[editable content omitted]";
          });
          data = { html: clone.outerHTML.slice(0, 20000) };
          break;
        }
        default:
          throw new Error("Unsupported action");
      }
    } catch (error) {
      data = { error: String(error) };
    }

    log({ action: message.action, result: data });
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "result", id: message.id, data }));
    }
  };
})();
