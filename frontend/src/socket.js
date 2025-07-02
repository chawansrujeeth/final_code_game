import { io } from "socket.io-client";

// Centralized socket instance
const SOCKET_URL = "https://final-code-game-team.onrender.com";

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  transports: ["websocket"]
});

// Simple state tracking
let connected = false;

socket.on("connect", () => {
  connected = true;
  console.log("[socket] Connected to server");
});

socket.on("disconnect", () => {
  connected = false;
  console.log("[socket] Disconnected from server");
});

export function isConnected() {
  return connected;
}

export default socket;
