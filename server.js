const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

function createTiles() {
  const colors = ['red', 'blue', 'yellow', 'black'];
  const tiles = [];
  let id = 0;
  for (let c = 0; c < 2; c++)
    for (const color of colors)
      for (let n = 1; n <= 13; n++)
        tiles.push({ id: id++, number: n, color });
  tiles.push({ id: id++, isJoker: true, color: 'joker' });
  tiles.push({ id: id++, isJoker: true, color: 'joker' });
  return tiles.sort(() => Math.random() - 0.5);
}

function dealTiles(pool, count) {
  return pool.splice(0, count);
}

io.on('connection', (socket) => {

  socket.on('createRoom', ({ playerName }) => {
    const roomId = uuidv4().slice(0, 6).toUpperCase();
    rooms[roomId] = {
      players: [],
      pool: createTiles(),
      board: [],
      currentTurn: 0,
      started: false,
      lastBoardState: []
    };
    const hand = dealTiles(rooms[roomId].pool, 14);
    const player = { id: socket.id, name: playerName, hand, opened: false };
    rooms[roomId].players.push(player);
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('roomCreated', { roomId, hand, playerIndex: 0 });
    io.to(roomId).emit('roomUpdate', getRoomPublicState(roomId));
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', 'Sala no encontrada');
    if (room.started) return socket.emit('error', 'El juego ya comenzó');
    if (room.players.length >= 4) return socket.emit('error', 'Sala llena');
    const hand = dealTiles(room.pool, 14);
    const playerIndex = room.players.length;
    const player = { id: socket.id, name: playerName, hand, opened: false };
    room.players.push(player);
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('joinedRoom', { roomId, hand, playerIndex });
    io.to(roomId).emit('roomUpdate', getRoomPublicState(roomId));
  });

  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.players[0].id !== socket.id) return;
    room.started = true;
    room.lastBoardState = [];
    io.to(roomId).emit('gameStarted', getRoomPublicState(roomId));
  });

  socket.on('playTurn', ({ roomId, board, usedTileIds }) => {
    const room = rooms[roomId];
    if (!room) return;
    const pIdx = room.players.findIndex(p => p.id === socket.id);
    if (pIdx !== room.currentTurn) return socket.emit('error', 'No es tu turno');

    const player = room.players[pIdx];
    // Remove used tiles from hand
    player.hand = player.hand.filter(t => !usedTileIds.includes(t.id));

    // Mark as opened if hasn't yet
    if (!player.opened) player.opened = true;

    room.board = board;
    room.lastBoardState = board;

    if (player.hand.length === 0) {
      io.to(roomId).emit('gameOver', { winner: player.name });
      return;
    }

    room.currentTurn = (room.currentTurn + 1) % room.players.length;
    io.to(roomId).emit('boardUpdate', {
      board: room.board,
      currentTurn: room.currentTurn,
      players: room.players.map(p => ({ name: p.name, handCount: p.hand.length, opened: p.opened }))
    });
    // Send updated hand to the player who just played
    socket.emit('handUpdate', { hand: player.hand });
  });

  socket.on('drawTile', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    const pIdx = room.players.findIndex(p => p.id === socket.id);
    if (pIdx !== room.currentTurn) return socket.emit('error', 'No es tu turno');
    if (room.pool.length === 0) return socket.emit('error', 'No hay fichas en el pozo');
    const [tile] = dealTiles(room.pool, 1);
    room.players[pIdx].hand.push(tile);
    room.currentTurn = (room.currentTurn + 1) % room.players.length;
    socket.emit('handUpdate', { hand: room.players[pIdx].hand });
    io.to(roomId).emit('boardUpdate', {
      board: room.board,
      currentTurn: room.currentTurn,
      players: room.players.map(p => ({ name: p.name, handCount: p.hand.length, opened: p.opened }))
    });
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;
    rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
    if (rooms[roomId].players.length === 0) delete rooms[roomId];
    else io.to(roomId).emit('roomUpdate', getRoomPublicState(roomId));
  });
});

function getRoomPublicState(roomId) {
  const room = rooms[roomId];
  return {
    roomId,
    started: room.started,
    currentTurn: room.currentTurn,
    board: room.board,
    poolCount: room.pool.length,
    players: room.players.map(p => ({ name: p.name, handCount: p.hand.length, opened: p.opened }))
  };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));