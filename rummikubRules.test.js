const assert = require('assert');
const {
  initialMeldValue,
  isValidMeld,
  normalizeBoard,
  validateBoard
} = require('./rummikubRules');

const tile = (id, number, color) => ({ id, number, color });
const joker = id => ({ id, isJoker: true, color: 'joker' });

function runTests() {
  const hand = [
    tile(1, 13, 'red'),
    joker(2),
    tile(3, 13, 'blue'),
    tile(4, 9, 'black'),
    tile(5, 10, 'black'),
    tile(6, 11, 'black')
  ];

  assert.strictEqual(isValidMeld([tile(1, 13, 'red'), joker(2), tile(3, 13, 'blue')]), true);
  assert.strictEqual(initialMeldValue([], [[tile(1, 13, 'red'), joker(2), tile(3, 13, 'blue')]], hand, [1, 2, 3]), 39);
  assert.strictEqual(initialMeldValue([], [[tile(1, 13, 'red'), joker(2), tile(3, 13, 'blue')]], hand, [1, 2, 3], { countJokers: false }), 26);

  assert.strictEqual(isValidMeld([tile(1, 13, 'red'), tile(7, 13, 'red'), tile(3, 13, 'blue')]), false);
  assert.strictEqual(isValidMeld([tile(4, 9, 'black'), joker(2), tile(6, 11, 'black')]), true);
  assert.strictEqual(initialMeldValue([], [[tile(4, 9, 'black'), joker(2), tile(6, 11, 'black')]], hand, [4, 2, 6]), 30);

  assert.deepStrictEqual(validateBoard([[tile(4, 9, 'black'), tile(5, 10, 'black'), tile(6, 11, 'black')]]), { ok: true });
  assert.strictEqual(validateBoard([[tile(4, 9, 'black'), tile(5, 10, 'blue'), tile(6, 11, 'black')]]).ok, false);
  assert.strictEqual(validateBoard([[tile(4, 9, 'black'), tile(4, 9, 'black'), tile(6, 11, 'black')]]).ok, false);

  const rearrangedBoard = [
    [tile(10, 4, 'red'), tile(11, 5, 'red'), tile(12, 6, 'red')],
    [tile(13, 7, 'red'), tile(14, 8, 'red'), tile(15, 9, 'red')],
    [tile(16, 5, 'blue'), tile(17, 5, 'yellow'), tile(11, 5, 'red')]
  ];
  assert.strictEqual(validateBoard(rearrangedBoard).ok, false);

  const splitRun = [
    [tile(10, 4, 'red'), tile(11, 5, 'red'), tile(12, 6, 'red')],
    [tile(13, 7, 'red'), tile(14, 8, 'red'), tile(15, 9, 'red')]
  ];
  assert.deepStrictEqual(validateBoard(splitRun), { ok: true });

  const normalized = normalizeBoard([[tile(22, 7, 'blue'), tile(21, 6, 'blue'), joker(23)]]);
  assert.deepStrictEqual(normalized[0].map(t => t.id), [23, 21, 22]);

  const jokerReused = [
    [tile(30, 7, 'blue'), tile(31, 8, 'blue'), tile(32, 9, 'blue')],
    [joker(33), tile(34, 10, 'red'), tile(35, 11, 'red'), tile(36, 12, 'red')]
  ];
  assert.deepStrictEqual(validateBoard(jokerReused), { ok: true });
}

runTests();
console.log('Rummikub rules simulation passed');
