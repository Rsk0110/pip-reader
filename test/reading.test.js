import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanWord, cropAbove, dwellDetector, pickWord, syllables } from '../src/reading.js';

test('cleanWord trims punctuation but keeps inner apostrophes', () => {
  assert.equal(cleanWord('“Hello,'), 'Hello');
  assert.equal(cleanWord("don’t."), "don't");
  assert.equal(cleanWord('well-known!'), 'well-known');
  assert.equal(cleanWord('...'), '');
});

// a line of text: words 30px tall with baseline at y=200
const line = (y, ...items) =>
  items.map(([text, x0, x1], i) => ({ text, confidence: 90 - i, bbox: { x0, y0: y - 30, x1, y1: y } }));

test('pickWord chooses the word just above the fingertip', () => {
  const words = [...line(200, ['The', 100, 160], ['quick', 175, 260], ['fox.', 275, 330]), ...line(250, ['jumped', 100, 210], ['over', 225, 290])];
  assert.equal(pickWord(words, { x: 210, y: 212 }).text, 'quick');
  assert.equal(pickWord(words, { x: 300, y: 208 }).text, 'fox');
  assert.equal(pickWord(words, { x: 150, y: 262 }).text, 'jumped');
  // tip slightly into the word itself still works
  assert.equal(pickWord(words, { x: 130, y: 192 }).text, 'The');
});

test('pickWord ignores far-away words, symbols and low confidence', () => {
  const words = [...line(200, ['far', 100, 140]), { text: '—', confidence: 99, bbox: { x0: 300, y0: 170, x1: 320, y1: 200 } }, { text: 'blurry', confidence: 10, bbox: { x0: 400, y0: 170, x1: 480, y1: 200 } }];
  assert.equal(pickWord(words, { x: 600, y: 210 }), null);
  assert.equal(pickWord(words, { x: 310, y: 210 }), null);
  assert.equal(pickWord(words, { x: 440, y: 210 }), null);
  assert.equal(pickWord(words, { x: 120, y: 400 }), null);
});

test('cropAbove stays inside the frame', () => {
  const f = { width: 1280, height: 720 };
  assert.deepEqual(cropAbove({ x: 640, y: 400 }, f), { x: 430, y: 268, w: 420, h: 150 });
  const edge = cropAbove({ x: 5, y: 20 }, f);
  assert.equal(edge.x, 0);
  assert.equal(edge.y, 0);
  const right = cropAbove({ x: 1279, y: 719 }, f);
  assert.equal(right.x + right.w, 1280);
});

test('dwellDetector fires once when still, re-arms after moving', () => {
  const d = dwellDetector({ radius: 10, ms: 400, rearm: 40 });
  const hits = [];
  let t = 0;
  const feed = (x, y, n) => {
    for (let i = 0; i < n; i++) hits.push(d({ x: x + (i % 2) * 3, y, t: (t += 50) }));
  };
  feed(100, 100, 12); // 600 ms still → fires once
  assert.equal(hits.filter(Boolean).length, 1);
  feed(110, 102, 10); // small wobble: no second fire
  assert.equal(hits.filter(Boolean).length, 1);
  feed(300, 100, 12); // moved to a new word → fires again
  assert.equal(hits.filter(Boolean).length, 2);
  assert.equal(d(null), null); // hand lost resets
});

test('dwellDetector does not fire while sweeping across a line', () => {
  const d = dwellDetector();
  let t = 0;
  const hits = [];
  for (let x = 0; x < 800; x += 15) hits.push(d({ x, y: 300, t: (t += 40) }));
  assert.equal(hits.filter(Boolean).length, 0);
});

test('syllables follow classroom rules', () => {
  const cases = {
    tiger: 'ti-ger',
    basket: 'bas-ket',
    table: 'ta-ble',
    purple: 'pur-ple',
    rabbit: 'rab-bit',
    happy: 'hap-py',
    monster: 'mon-ster',
    pocket: 'pock-et',
    chicken: 'chick-en',
    dinosaur: 'di-no-saur',
    banana: 'ba-na-na',
    potato: 'po-ta-to',
    butterfly: 'but-ter-fly',
    reading: 'read-ing',
    wanted: 'want-ed',
    jumped: 'jumped',
    make: 'make',
    cat: 'cat',
    lion: 'li-on',
    sunshine: 'sun-shine',
    hundred: 'hun-dred',
    window: 'win-dow',
    peacefully: 'peace-ful-ly',
    frightened: 'fright-ened',
    lightning: 'light-ning',
    hedgehog: 'hedge-hog',
    kindness: 'kind-ness',
    carefully: 'care-ful-ly',
  };
  const wrong = [];
  for (const [w, want] of Object.entries(cases)) {
    const got = syllables(w).join('-');
    if (got !== want) wrong.push(`${w}: got ${got}, want ${want}`);
  }
  assert.deepEqual(wrong, []);
});

test('syllables keep the original capitalisation and pass through non-words', () => {
  assert.equal(syllables('Tiger').join('-'), 'Ti-ger');
  assert.deepEqual(syllables('42'), ['42']);
  assert.deepEqual(syllables('Zoë'), ['Zoë']);
});
