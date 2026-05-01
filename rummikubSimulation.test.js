const assert = require('assert');
const {
  getBoardTileIds,
  initialMeldValue,
  isValidMeld,
  normalizeBoard,
  removeTilesFromHand,
  validateBoard
} = require('./rummikubRules');

const COLORS = ['red', 'blue', 'yellow', 'black'];
const TOTAL_TILE_COUNT = 106;

function createTiles() {
  const tiles = [];
  let id = 0;
  for (let copy = 0; copy < 2; copy++) {
    for (const color of COLORS) {
      for (let number = 1; number <= 13; number++) {
        tiles.push({ id: id++, number, color });
      }
    }
  }
  tiles.push({ id: id++, isJoker: true, color: 'joker' });
  tiles.push({ id: id++, isJoker: true, color: 'joker' });
  return tiles;
}

function rng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function shuffle(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function combinations(items, size, start = 0, current = [], output = []) {
  if (current.length === size) {
    output.push([...current]);
    return output;
  }
  for (let i = start; i <= items.length - (size - current.length); i++) {
    current.push(items[i]);
    combinations(items, size, i + 1, current, output);
    current.pop();
  }
  return output;
}

function findValidMelds(hand, maxSize = 5) {
  const melds = [];
  const limit = Math.min(maxSize, hand.length);
  for (let size = 3; size <= limit; size++) {
    for (const combo of combinations(hand, size)) {
      if (isValidMeld(combo)) melds.push(combo);
    }
  }
  return melds.sort((a, b) => b.length - a.length);
}

function openingValue(meld) {
  return initialMeldValue([], [meld], meld, meld.map(tile => tile.id), { countJokers: false });
}

function assertTileConservation(game) {
  const ids = [
    ...game.pool.map(tile => tile.id),
    ...game.board.flat().map(tile => tile.id),
    ...game.players.flatMap(player => player.hand.map(tile => tile.id))
  ];
  assert.strictEqual(ids.length, TOTAL_TILE_COUNT, 'tile count changed');
  assert.strictEqual(new Set(ids).size, TOTAL_TILE_COUNT, 'tile duplicated or lost');
}

function assertGameState(game) {
  assert.deepStrictEqual(validateBoard(game.board), { ok: true });
  assert.strictEqual(getBoardTileIds(game.board).length, game.board.flat().length);
  assertTileConservation(game);
}

function playMeld(game, player, meld) {
  const usedIds = meld.map(tile => tile.id);
  game.board.push(meld);
  game.board = normalizeBoard(game.board);
  player.hand = removeTilesFromHand(player.hand, usedIds);
  if (!player.opened) player.opened = true;
}

function tryAddOneTileToBoard(game, player) {
  for (const tile of [...player.hand]) {
    for (let groupIndex = 0; groupIndex < game.board.length; groupIndex++) {
      const nextBoard = game.board.map(group => [...group]);
      nextBoard[groupIndex].push(tile);
      if (validateBoard(nextBoard).ok) {
        game.board = normalizeBoard(nextBoard);
        player.hand = removeTilesFromHand(player.hand, [tile.id]);
        return true;
      }
    }
  }
  return false;
}

function trySimpleManipulation(game, player) {
  for (let sourceIndex = 0; sourceIndex < game.board.length; sourceIndex++) {
    const source = game.board[sourceIndex];
    if (source.length <= 3) continue;

    for (const movedTile of source) {
      for (const handTile of player.hand) {
        for (let targetIndex = 0; targetIndex < game.board.length; targetIndex++) {
          if (targetIndex === sourceIndex) continue;
          const nextBoard = game.board.map(group => group.filter(tile => tile.id !== movedTile.id));
          nextBoard[targetIndex].push(movedTile, handTile);
          const compactBoard = nextBoard.filter(group => group.length > 0);
          if (validateBoard(compactBoard).ok) {
            game.board = normalizeBoard(compactBoard);
            player.hand = removeTilesFromHand(player.hand, [handTile.id]);
            return true;
          }
        }
      }
    }
  }
  return false;
}

function takeTurn(game) {
  const player = game.players[game.currentTurn];

  if (!player.opened) {
    const opening = findValidMelds(player.hand, 5).find(meld => openingValue(meld) >= 30);
    if (opening) {
      playMeld(game, player, opening);
      return;
    }
  } else {
    if (tryAddOneTileToBoard(game, player)) return;
    if (trySimpleManipulation(game, player)) return;
    const meld = findValidMelds(player.hand, 5)[0];
    if (meld) {
      playMeld(game, player, meld);
      return;
    }
  }

  if (game.pool.length > 0) player.hand.push(game.pool.shift());
}

function simulateGame(seed, playerCount = 4, maxTurns = 700) {
  const random = rng(seed);
  const pool = shuffle(createTiles(), random);
  const players = Array.from({ length: playerCount }, (_, index) => ({
    name: `P${index + 1}`,
    opened: false,
    hand: pool.splice(0, 14)
  }));
  const game = { players, pool, board: [], currentTurn: 0 };

  let winner = null;
  let turns = 0;
  let staleTurns = 0;

  while (!winner && turns < maxTurns && staleTurns < playerCount * 12) {
    const before = JSON.stringify({
      board: game.board,
      hand: game.players[game.currentTurn].hand.map(tile => tile.id),
      pool: game.pool.length
    });

    takeTurn(game);
    assertGameState(game);

    const player = game.players[game.currentTurn];
    if (player.hand.length === 0) winner = player.name;

    const after = JSON.stringify({
      board: game.board,
      hand: player.hand.map(tile => tile.id),
      pool: game.pool.length
    });
    staleTurns = before === after || game.pool.length === 0 ? staleTurns + 1 : 0;
    game.currentTurn = (game.currentTurn + 1) % playerCount;
    turns++;
  }

  return {
    seed,
    turns,
    winner,
    pool: game.pool.length,
    boardTiles: game.board.flat().length,
    handTiles: game.players.reduce((sum, player) => sum + player.hand.length, 0)
  };
}

function runSimulations(count = 50, playerCount = 4) {
  const results = [];
  for (let index = 1; index <= count; index++) {
    results.push(simulateGame(1000 + index, playerCount));
  }
  return results;
}

const playerCount = 4;
const results = runSimulations(50, playerCount);
const winners = results.filter(result => result.winner).length;
const avgTurns = Math.round(results.reduce((sum, result) => sum + result.turns, 0) / results.length);

console.log(`Muchikub simulation passed: ${results.length} games with ${playerCount} players`);
console.log(`Finished with winner: ${winners}/${results.length}`);
console.log(`Average turns: ${avgTurns}`);
