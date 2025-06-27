// yjs_server.js
// Simple y-websocket server for collaborative editing (fixed for latest y-websocket)

const http = require('http');
const WebSocket = require('ws');
const { setupWSConnection } = require('y-websocket/bin/utils');

const port = process.env.YJS_PORT || 5051;

const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  setupWSConnection(ws, req);
});

server.listen(port, () => {
  console.log(`Yjs WebSocket server running on port ${port}`);
});
