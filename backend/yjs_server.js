// yjs_server.js
// Simple y-websocket server for collaborative editing

const { WebsocketServer } = require('y-websocket');
const http = require('http');

const port = process.env.YJS_PORT || 1234;

const server = http.createServer();
const wss = new WebsocketServer({ server });

server.listen(port, () => {
  console.log(`Yjs WebSocket server running on port ${port}`);
});
