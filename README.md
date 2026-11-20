# BrowserBridge v0.2

A mobile-friendly prototype that connects one Safari tab to a small Node.js relay.

## Files

- `server.js`: authenticated HTTP and WebSocket relay.
- `g2iuhc.js`: browser-side client loaded by the bookmarklet.
- `package.json`: Node.js dependencies and start command.

## Deploy

1. Create a Node.js web service from this GitHub repository (for example, on Render).
2. Build command: `npm install`
3. Start command: `npm start`
4. Set an environment variable named `BB_TOKEN` to a randomly generated secret of at least 32 characters.
5. Use the service's HTTPS hostname in the bookmarklet.

GitHub Pages cannot run this WebSocket server; the repository stores the code, while a Node.js host runs it.

## iOS Safari bookmarklet

Create a bookmark, then replace its URL with:

```javascript
javascript:(()=>{const s=document.createElement("script");s.src="https://raw.githubusercontent.com/sspeth000/BrowserBridge/main/g2iuhc.js";s.onload=()=>console.log("BrowserBridge loaded");s.onerror=()=>alert("Could not load BrowserBridge");document.documentElement.append(s)})();
```

When launched, the client asks for the relay hostname and access token, then connects using WSS.

## Supported commands

POST `/api/command` with an Authorization bearer token and JSON body:

- `{"action":"get_page_info"}`
- `{"action":"get_dom"}`
- `{"action":"get_links"}`

The DOM response omits script, iframe, object, embed, and form-control contents. This prototype intentionally does not accept arbitrary JavaScript execution or page-click commands.

## Security notes

- Keep `BB_TOKEN` private. Anyone with it can issue the supported read-only commands.
- The bookmarklet asks for the token at runtime; do not put the token in this repository.
- Use only on websites you own or are authorized to inspect.
- The WebSocket token is passed in the connection URL, so use a private test deployment and rotate the token if it is exposed.
- This is a single-browser prototype, not a production multi-user service.
