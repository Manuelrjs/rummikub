const assert = require('assert');
const {
  initialMeldValue,
  isValidMeld,
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

  assert.strictEqual(isValidMeld([tile(1, 13, 'red'), tile(7, 13, 'red'), tile(3, 13, 'blue')]), false);
  assert.strictEqual(isValidMeld([tile(4, 9, 'black'), joker(2), tile(6, 11, 'black')]), true);
  assert.strictEqual(initialMeldValue([], [[tile(4, 9, 'black'), joker(2), tile(6, 11, 'black')]], hand, [4, 2, 6]), 30);

  assert.deepStrictEqual(validateBoard([[tile(4, 9, 'black'), tile(5, 10, 'black'), tile(6, 11, 'black')]]), { ok: true });
  assert.strictEqual(validateBoard([[tile(4, 9, 'black'), tile(5, 10, 'blue'), tile(6, 11, 'black')]]).ok, false);
}

runTests();
console.log('Rummikub rules simulation passed');
