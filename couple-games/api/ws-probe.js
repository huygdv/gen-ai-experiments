import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

// Transport-only prototype. Never use process-local memory for authoritative
// cross-instance game state. Gameplay must use shared Pub/Sub and an atomic store.
const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify({
    ok: true,
    transport: 'websocket',
    phase: 'prototype',
    gameTransportActive: false,
    region: process.env.VERCEL_REGION || 'unknown',
  }));
});
const sockets = new WebSocketServer({ server, maxPayload: 1024, perMessageDeflate: false });

sockets.on('connection', socket => {
  const connectedAt = Date.now();
  socket.send(JSON.stringify({
    type: 'ready', serverTime: connectedAt,
    region: process.env.VERCEL_REGION || 'unknown',
    transport: 'websocket',
  }));
  socket.on('message', data => {
    if (socket.readyState !== WebSocket.OPEN) return;
    try {
      const request = JSON.parse(data.toString());
      if (request.type !== 'ping' || !Number.isSafeInteger(request.seq)) {
        socket.send(JSON.stringify({ type: 'error', code: 'unsupported_message' }));
        return;
      }
      socket.send(JSON.stringify({
        type: 'pong', seq: request.seq,
        serverTime: Date.now(), serverReceivedAt: Date.now(),
      }));
    } catch (_) {
      socket.send(JSON.stringify({ type: 'error', code: 'bad_json' }));
    }
  });
  socket.on('error', () => {});
});

export default server;
