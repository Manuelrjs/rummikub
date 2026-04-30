const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const {
  getBoardTileIds,
  inferPlayedTileIds,
  initialMeldValue,
  normalizeBoard,
  removeTilesFromHand,
  validateBoard
} = require('./rummikubRules');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const rooms = {};
const RECONNECT_GRACE_MS = 30 * 60 * 1000;

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

function boardWithoutPlayedTiles(board, playedTileIds) {
  const playedIds = new Set(playedTileIds);
  return board.filter(group => !group.some(tile => playedIds.has(tile.id)));
}

function restorePlayer(socket, roomId, player) {
  const room = rooms[roomId];
  player.id = socket.id;
  player.connected = true;
  player.disconnectedAt = null;
  socket.join(roomId);
  socket.roomId = roomId;
  socket.playerToken = player.token;

  socket.emit('rejoinedRoom', {
    roomId,
    hand: player.hand,
    playerIndex: room.players.indexOf(player),
    playerId: socket.id,
    playerToken: player.token
  });
  socket.emit('boardUpdate', getRoomPublicState(roomId));
  io.to(roomId).emit('roomUpdate', getRoomPublicState(roomId));
  io.to(roomId).emit('boardUpdate', getRoomPublicState(roomId));
}

function removePlayerFromRoom(roomId, playerToken) {
  const room = rooms[roomId];
  if (!room) return;

  const playerIndex = room.players.findIndex(p => p.token === playerToken);
  if (playerIndex === -1) return;

  room.players.splice(playerIndex, 1);
  if (room.players.length === 0) {
    delete rooms[roomId];
    return;
  }

  if (playerIndex < room.currentTurn) room.currentTurn--;
  if (room.currentTurn >= room.players.length) room.currentTurn = 0;

  io.to(roomId).emit('roomUpdate', getRoomPublicState(roomId));
  io.to(roomId).emit('boardUpdate', getRoomPublicState(roomId));
}

io.on('connection', (socket) => {

  socket.on('createRoom', ({ playerName, playerToken }) => {
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
    const token = playerToken || uuidv4();
    const player = { id: socket.id, token, name: playerName, hand, opened: false, connected: true, disconnectedAt: null };
    rooms[roomId].players.push(player);
    socket.join(roomId);
    socket.roomId = roomId;
    socket.playerToken = token;
    socket.emit('roomCreated', { roomId, hand, playerIndex: 0, playerId: socket.id, playerToken: token });
    io.to(roomId).emit('roomUpdate', getRoomPublicState(roomId));
  });

  socket.on('joinRoom', ({ roomId, playerName, playerToken }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', 'Sala no encontrada');
    const existingPlayer = room.players.find(p => p.token && p.token === playerToken);
    if (existingPlayer) return restorePlayer(socket, roomId, existingPlayer);
    if (room.started) return socket.emit('error', 'El juego ya comenzó');
    if (room.players.length >= 4) return socket.emit('error', 'Sala llena');
    const hand = dealTiles(room.pool, 14);
    const playerIndex = room.players.length;
    const token = playerToken || uuidv4();
    const player = { id: socket.id, token, name: playerName, hand, opened: false, connected: true, disconnectedAt: null };
    room.players.push(player);
    socket.join(roomId);
    socket.roomId = roomId;
    socket.playerToken = token;
    socket.emit('joinedRoom', { roomId, hand, playerIndex, playerId: socket.id, playerToken: token });
    io.to(roomId).emit('roomUpdate', getRoomPublicState(roomId));
  });

  socket.on('rejoinRoom', ({ roomId, playerToken }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('rejoinFailed');
    const player = room.players.find(p => p.token && p.token === playerToken);
    if (!player) return socket.emit('rejoinFailed');
    restorePlayer(socket, roomId, player);
  });

  socket.on('leaveRoom', ({ roomId, playerToken }) => {
    socket.leave(roomId);
    socket.roomId = null;
    removePlayerFromRoom(roomId, playerToken || socket.playerToken);
  });

  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.players[0].id !== socket.id) return;
    if (room.players.length < 2) return socket.emit('error', 'Necesitas al menos 2 jugadores para iniciar');
    room.started = true;
    room.lastBoardState = [];
    io.to(roomId).emit('gameStarted', getRoomPublicState(roomId));
  });

  socket.on('playTurn', ({ roomId, board, usedTileIds }) => {
    const room = rooms[roomId];
    if (!room) return;
    const pIdx = room.players.findIndex(p => p.id === socket.id);
    if (pIdx !== room.currentTurn) return socket.emit('turnError', 'No es tu turno');
    if (!Array.isArray(board)) {
      return socket.emit('turnError', 'No hiciste ninguna jugada. Tomá una ficha o bajá fichas.');
    }

    const player = room.players[pIdx];
    const previousBoardIds = getBoardTileIds(room.board);
    const nextBoardIds = new Set(getBoardTileIds(board));
    if (previousBoardIds.some(id => !nextBoardIds.has(id))) {
      return socket.emit('turnError', 'No podés dejar fichas de la mesa sin ubicar en un grupo válido.');
    }

    const validation = validateBoard(board);
    if (!validation.ok) return socket.emit('turnError', validation.message);

    const inferredTileIds = inferPlayedTileIds(room.board, board, player.hand);
    const playedTileIds = Array.from(new Set([...(Array.isArray(usedTileIds) ? usedTileIds : []), ...inferredTileIds]));
    const boardChanged = JSON.stringify(board) !== JSON.stringify(room.board);

    if (playedTileIds.length === 0 && !boardChanged) {
      return socket.emit('turnError', 'No hiciste ninguna jugada. Tomá una ficha o bajá fichas.');
    }

    if (!player.opened) {
      const mixedWithTableTiles = board.some(group => {
        const hasPlayedTile = group.some(tile => playedTileIds.includes(tile.id));
        const hasTableTile = group.some(tile => !playedTileIds.includes(tile.id));
        return hasPlayedTile && hasTableTile;
      });

      if (mixedWithTableTiles || JSON.stringify(boardWithoutPlayedTiles(board, playedTileIds)) !== JSON.stringify(room.board)) {
        return socket.emit('turnError', 'Tu primera bajada debe formarse solo con fichas de tu mano.');
      }

      const openingValue = initialMeldValue(room.board, board, player.hand, playedTileIds, { countJokers: false });
      if (openingValue < 30) {
        return socket.emit('turnError', `Tu primera bajada debe sumar 30 o mas sin contar comodines. Esta suma ${openingValue}.`);
      }
    }

    // Remove used tiles from hand
    player.hand = removeTilesFromHand(player.hand, playedTileIds);

    // Mark as opened if hasn't yet
    if (!player.opened) player.opened = true;

    room.board = normalizeBoard(board);
    room.lastBoardState = room.board;

    if (player.hand.length === 0) {
      io.to(roomId).emit('gameOver', { winner: player.name });
      return;
    }

    room.currentTurn = (room.currentTurn + 1) % room.players.length;
    io.to(roomId).emit('boardUpdate', getRoomPublicState(roomId));
    // Send updated hand to the player who just played
    socket.emit('handUpdate', { hand: player.hand });
  });

  socket.on('drawTile', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    const pIdx = room.players.findIndex(p => p.id === socket.id);
    if (pIdx !== room.currentTurn) return socket.emit('turnError', 'No es tu turno');
    if (room.players.length < 2) return socket.emit('turnError', 'Necesitas al menos 2 jugadores para cambiar de turno');
    if (room.pool.length === 0) return socket.emit('turnError', 'No hay fichas en el pozo');
    const [tile] = dealTiles(room.pool, 1);
    room.players[pIdx].hand.push(tile);
    room.currentTurn = (room.currentTurn + 1) % room.players.length;
    socket.emit('handUpdate', { hand: room.players[pIdx].hand });
    io.to(roomId).emit('boardUpdate', getRoomPublicState(roomId));
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    player.connected = false;
    player.disconnectedAt = Date.now();
    io.to(roomId).emit('roomUpdate', getRoomPublicState(roomId));
    io.to(roomId).emit('boardUpdate', getRoomPublicState(roomId));

    setTimeout(() => {
      const activeRoom = rooms[roomId];
      if (!activeRoom) return;
      const stalePlayer = activeRoom.players.find(p => p.token === player.token);
      if (!stalePlayer || stalePlayer.connected) return;
      if (Date.now() - stalePlayer.disconnectedAt < RECONNECT_GRACE_MS) return;
      activeRoom.players = activeRoom.players.filter(p => p.token !== stalePlayer.token);
      if (activeRoom.players.length === 0) {
        delete rooms[roomId];
        return;
      }
      if (activeRoom.currentTurn >= activeRoom.players.length) activeRoom.currentTurn = 0;
      io.to(roomId).emit('roomUpdate', getRoomPublicState(roomId));
      io.to(roomId).emit('boardUpdate', getRoomPublicState(roomId));
    }, RECONNECT_GRACE_MS);
  });
});

function getRoomPublicState(roomId) {
  const room = rooms[roomId];
  return {
    roomId,
    started: room.started,
    currentTurn: room.currentTurn,
    currentPlayerId: room.players[room.currentTurn]?.id || null,
    board: room.board,
    poolCount: room.pool.length,
    players: room.players.map(p => ({ id: p.id, name: p.name, handCount: p.hand.length, opened: p.opened, connected: p.connected !== false }))
  };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
