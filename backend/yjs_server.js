// yjs_server.js
// Simple y-websocket server for collaborative editing (Render-compatible)

const http = require('http');
const WebSocket = require('ws');
const { setupWSConnection } = require('y-websocket');

const port = process.env.PORT || process.env.YJS_PORT || 5051;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Yjs WebSocket server is running!');
  } else {
    res.writeHead(404);
    res.end();
  }
});
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  setupWSConnection(ws, req);
});

server.listen(port, () => {
  console.log(`Yjs WebSocket server running on port ${port}`);
});

