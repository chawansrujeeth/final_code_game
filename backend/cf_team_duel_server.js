const { Server } = require("socket.io");
const http = require("http");

const server = http.createServer();
const io = new Server(server, { cors: { origin: "*" } });

let waitingPlayers = [];

function makeTeams(players) {
  // Shuffle and split into 2 teams
  players = players.sort(() => Math.random() - 0.5);
  return [players.slice(0, 2), players.slice(2, 4)];
}

io.on("connection", (socket) => {
  socket.on("join_team_duel", ({ userId, name }) => {
    waitingPlayers.push({ socket, userId, name });
    if (waitingPlayers.length >= 4) {
      const roomId = "room_" + Math.random().toString(36).slice(2, 10);
      const [teamA, teamB] = makeTeams(waitingPlayers.splice(0, 4));
      // Assign teams
      teamA.forEach((player) => {
        player.socket.join(roomId + "_A");
        player.socket.emit("team_assignment", {
          roomId,
          teamId: "A",
          teamMembers: teamA.map(p => ({ userId: p.userId, name: p.name })),
          opponents: teamB.map(p => ({ userId: p.userId, name: p.name }))
        });
      });
      teamB.forEach((player) => {
        player.socket.join(roomId + "_B");
        player.socket.emit("team_assignment", {
          roomId,
          teamId: "B",
          teamMembers: teamB.map(p => ({ userId: p.userId, name: p.name })),
          opponents: teamA.map(p => ({ userId: p.userId, name: p.name }))
        });
      });
    }
  });

  socket.on("team_code_update", ({ code, roomId, teamId }) => {
    // Broadcast to all in the same team
    io.to(roomId + "_" + teamId).emit("team_code_update", { code });
  });

  socket.on("disconnect", () => {
    // Remove from waitingPlayers if present
    waitingPlayers = waitingPlayers.filter(p => p.socket !== socket);
  });
});

server.listen(4000, () => {
  console.log("Team duel server running on port 4000");
});
