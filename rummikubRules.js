function isJoker(tile) {
  return Boolean(tile && tile.isJoker);
}

function tileValue(tile) {
  return isJoker(tile) ? 0 : Number(tile.number) || 0;
}

function getBoardTileIds(board) {
  if (!Array.isArray(board)) return [];
  return board.flat().filter(Boolean).map(tile => tile.id);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isValidGroup(tiles) {
  if (!Array.isArray(tiles) || tiles.length < 3 || tiles.length > 4) return false;

  const normalTiles = tiles.filter(tile => !isJoker(tile));
  if (normalTiles.length === 0) return true;

  const number = normalTiles[0].number;
  const colors = new Set();

  for (const tile of normalTiles) {
    if (tile.number !== number) return false;
    if (colors.has(tile.color)) return false;
    colors.add(tile.color);
  }

  return tiles.length <= 4;
}

function canPlaceRunWithJokers(numbers, jokerCount) {
  const sorted = [...numbers].sort((a, b) => a - b);
  if (new Set(sorted).size !== sorted.length) return false;

  const minStart = Math.max(1, sorted[sorted.length - 1] - numbers.length - jokerCount + 1);
  const maxStart = Math.min(sorted[0], 13 - numbers.length - jokerCount + 1);

  for (let start = minStart; start <= maxStart; start++) {
    const sequence = new Set();
    for (let value = start; value < start + numbers.length + jokerCount; value++) {
      sequence.add(value);
    }

    if (sorted.every(value => sequence.has(value))) return true;
  }

  return false;
}

function getRunStart(numbers, jokerCount) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const minStart = Math.max(1, sorted[sorted.length - 1] - numbers.length - jokerCount + 1);
  const maxStart = Math.min(sorted[0], 13 - numbers.length - jokerCount + 1);

  for (let start = minStart; start <= maxStart; start++) {
    const sequence = new Set();
    for (let value = start; value < start + numbers.length + jokerCount; value++) {
      sequence.add(value);
    }

    if (sorted.every(value => sequence.has(value))) return start;
  }

  return null;
}

function isValidRun(tiles) {
  if (!Array.isArray(tiles) || tiles.length < 3) return false;

  const normalTiles = tiles.filter(tile => !isJoker(tile));
  if (normalTiles.length === 0) return true;

  const color = normalTiles[0].color;
  if (!normalTiles.every(tile => tile.color === color)) return false;

  return canPlaceRunWithJokers(
    normalTiles.map(tile => tile.number),
    tiles.length - normalTiles.length
  );
}

function isValidMeld(tiles) {
  return isValidGroup(tiles) || isValidRun(tiles);
}

function getRunValues(tiles) {
  const normalTiles = tiles.filter(tile => !isJoker(tile));
  const jokerTiles = tiles.filter(tile => isJoker(tile));
  const start = getRunStart(normalTiles.map(tile => tile.number), jokerTiles.length);
  if (start === null) return new Map();

  const sequenceValues = [];
  for (let value = start; value < start + tiles.length; value++) {
    sequenceValues.push(value);
  }

  const values = new Map();
  const usedValues = new Set();
  for (const tile of normalTiles) {
    values.set(tile.id, tile.number);
    usedValues.add(tile.number);
  }

  const missingValues = sequenceValues.filter(value => !usedValues.has(value));
  for (let index = 0; index < jokerTiles.length; index++) {
    values.set(jokerTiles[index].id, missingValues[index] || 0);
  }

  return values;
}

function meldTileValues(tiles) {
  if (!Array.isArray(tiles)) return new Map();

  const values = new Map();
  const normalTiles = tiles.filter(tile => !isJoker(tile));
  const jokerTiles = tiles.filter(tile => isJoker(tile));

  if (isValidGroup(tiles)) {
    const groupValue = normalTiles[0]?.number || 0;
    for (const tile of tiles) values.set(tile.id, groupValue);
    return values;
  }

  if (isValidRun(tiles)) {
    return getRunValues(tiles);
  }

  return values;
}

function normalizeMeld(tiles) {
  const group = clone(tiles);
  const colorOrder = { red: 1, blue: 2, yellow: 3, black: 4, joker: 5 };

  if (isValidRun(group)) {
    const values = getRunValues(group);
    return group.sort((a, b) => {
      const aValue = values.get(a.id) || a.number || 0;
      const bValue = values.get(b.id) || b.number || 0;
      return aValue - bValue || (a.id || 0) - (b.id || 0);
    });
  }

  if (isValidGroup(group)) {
    return group.sort((a, b) => {
      return (colorOrder[a.color] || 99) - (colorOrder[b.color] || 99) || (a.id || 0) - (b.id || 0);
    });
  }

  return group;
}

function normalizeBoard(board) {
  if (!Array.isArray(board)) return [];
  return board.map(group => normalizeMeld(group)).filter(group => group.length > 0);
}

function validateBoard(board) {
  if (!Array.isArray(board)) {
    return { ok: false, message: 'La mesa no tiene un formato valido.' };
  }

  const seenIds = new Set();

  for (const group of board) {
    if (!Array.isArray(group) || group.length === 0) {
      return { ok: false, message: 'Hay un grupo vacio en la mesa.' };
    }

    for (const tile of group) {
      if (!tile || seenIds.has(tile.id)) {
        return { ok: false, message: 'Hay fichas duplicadas en la mesa.' };
      }
      seenIds.add(tile.id);
    }

    if (!isValidMeld(group)) {
      return { ok: false, message: 'Todos los grupos de la mesa deben ser ternas o escaleras validas.' };
    }
  }

  return { ok: true };
}

function inferPlayedTileIds(previousBoard, nextBoard, playerHand) {
  const previousBoardIds = new Set(getBoardTileIds(previousBoard));
  const playerHandIds = new Set(playerHand.map(tile => tile.id));

  return getBoardTileIds(nextBoard).filter(id => {
    return !previousBoardIds.has(id) && playerHandIds.has(id);
  });
}

function initialMeldValue(previousBoard, nextBoard, playerHand, explicitTileIds = [], options = {}) {
  const inferredIds = inferPlayedTileIds(previousBoard, nextBoard, playerHand);
  const playedIds = new Set([...explicitTileIds, ...inferredIds]);
  const countJokers = options.countJokers !== false;
  let score = 0;

  for (const group of nextBoard) {
    const values = meldTileValues(group);
    for (const tile of group) {
      if (!playedIds.has(tile.id)) continue;
      if (isJoker(tile) && !countJokers) continue;
      score += values.get(tile.id) || tileValue(tile);
    }
  }

  return score;
}

function removeTilesFromHand(hand, tileIds) {
  const ids = new Set(tileIds);
  return hand.filter(tile => !ids.has(tile.id));
}

module.exports = {
  clone,
  getBoardTileIds,
  inferPlayedTileIds,
  initialMeldValue,
  isValidMeld,
  normalizeBoard,
  removeTilesFromHand,
  validateBoard
};
