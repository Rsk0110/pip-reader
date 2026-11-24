// Pip — pure reading logic (no DOM): word picking, dwell detection, crop
// geometry and a syllable splitter. Unit-tested in test/reading.test.js.

/** Strip punctuation around a word; keep inner apostrophes and hyphens. */
export const cleanWord = (text) =>
  String(text ?? '')
    .normalize('NFKC')
    .replace(/[’‘]/g, "'")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/**
 * Choose the word a finger is pointing at. Readers put their fingertip just
 * *under* a word, so we prefer words whose bottom edge sits a little above the
 * tip and whose horizontal span covers it.
 * @param {{text:string, confidence?:number, bbox:{x0:number,y0:number,x1:number,y1:number}}[]} words
 * @param {{x:number,y:number}} tip
 */
export const pickWord = (words, tip, { maxGap = 90, maxSide = 60, minConfidence = 35 } = {}) => {
  let best = null;
  let bestScore = Infinity;
  for (const w of words) {
    const text = cleanWord(w.text);
    if (!text || !/\p{L}/u.test(text)) continue;
    if ((w.confidence ?? 100) < minConfidence) continue;
    const { x0, y0, x1, y1 } = w.bbox;
    const h = Math.max(1, y1 - y0);
    // vertical: distance from tip up to the word's baseline; slightly overlapping is fine
    const gap = tip.y - y1;
    if (gap < -h * 0.8 || gap > maxGap) continue;
    // horizontal: 0 if the tip is under the word, else distance to its nearest edge
    const side = tip.x < x0 ? x0 - tip.x : tip.x > x1 ? tip.x - x1 : 0;
    if (side > maxSide) continue;
    const score = Math.abs(gap - h * 0.3) + side * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = { ...w, text };
    }
  }
  return best;
};

/**
 * Region of the frame to read: a band above the fingertip. Keeps OCR fast and
 * focused on the word being pointed at.
 */
export const cropAbove = (tip, frame, { width = 420, height = 150, below = 18 } = {}) => {
  const w = Math.min(width, frame.width);
  const h = Math.min(height, frame.height);
  const x = Math.round(Math.max(0, Math.min(frame.width - w, tip.x - w / 2)));
  const y = Math.round(Math.max(0, Math.min(frame.height - h, tip.y + below - h)));
  return { x, y, w, h };
};

/**
 * Dwell detector: reports once when a point stays within `radius` px for `ms`.
 * Re-arms after the point moves away by `rearm` px.
 */
export const dwellDetector = ({ radius = 14, ms = 450, rearm = 40 } = {}) => {
  let anchor = null;
  let fired = false;
  return (p) => {
    if (!p) {
      anchor = null;
      fired = false;
      return null;
    }
    if (!anchor) {
      anchor = { ...p };
      return null;
    }
    const d = Math.hypot(p.x - anchor.x, p.y - anchor.y);
    if (fired) {
      if (d > rearm) {
        anchor = { ...p };
        fired = false;
      }
      return null;
    }
    if (d > radius) {
      anchor = { ...p };
      return null;
    }
    if (p.t - anchor.t >= ms) {
      fired = true;
      return { x: anchor.x, y: anchor.y };
    }
    return null;
  };
};

// ---------- syllables ----------

const VOWELS = 'aeiouy';
const DIPHTHONGS = new Set(['ai', 'ay', 'au', 'aw', 'ea', 'ee', 'ei', 'ey', 'eu', 'ew', 'ie', 'oa', 'oe', 'oi', 'oo', 'ou', 'ow', 'oy', 'ue', 'ui', 'eau']);
const ONSETS = new Set([
  'bl', 'br', 'ch', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'kn', 'ph', 'pl', 'pr', 'qu', 'sc', 'sh', 'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'sw', 'th', 'tr', 'tw', 'wh', 'wr',
  'chr', 'scr', 'shr', 'spl', 'spr', 'squ', 'str', 'thr',
]);
// clusters that should never be split between syllables
const KEEP = new Set(['ch', 'sh', 'th', 'ph', 'wh', 'gh', 'ck', 'ng', 'qu']);

const isVowelAt = (w, i) => {
  const c = w[i];
  if (c === 'y') return i > 0 && !VOWELS.includes(w[i - 1]); // y is a vowel after a consonant
  return 'aeiou'.includes(c);
};

/** Split an English word into syllables with classroom rules (VC/CV, V/CV, consonant-le, silent e, -ed). */
export const syllables = (word) => {
  const original = cleanWord(word);
  const w = original.toLowerCase();
  if (w.length <= 3 || !/^[a-z']+$/.test(w)) return [original];

  // "-ght", "-dge", "-tch" close the syllable before them: fright-ened, light-ning, hedge-hog, kitch-en
  const coda = w.search(/ght|dge|tch/);
  if (coda > 0 && coda + 3 < w.length && /[aeiouy]/.test(w.slice(coda + 3))) {
    return [original.slice(0, coda + 3), ...syllables(original.slice(coda + 3))];
  }
  // common suffixes are their own syllable: read-ing, want-ed
  if (w.length >= 6 && w.endsWith('ing') && /[aeiouy]/.test(w.slice(0, -3))) {
    return [...syllables(original.slice(0, -3)), original.slice(-3)];
  }
  if (w.length >= 5 && /[td]ed$/.test(w) && /[aeiouy]/.test(w.slice(0, -2))) {
    return [...syllables(original.slice(0, -2)), original.slice(-2)];
  }
  // peace-ful-ly, kind-ness, help-less, move-ment: suffixes keep the stem whole (incl. its silent e)
  for (const suf of ['fully', 'ness', 'less', 'ment', 'ful', 'ly']) {
    const stem = w.slice(0, -suf.length);
    if (w.endsWith(suf) && stem.length >= 3 && /[aeiouy]/.test(stem) && !/[^aeiou]l$/.test(stem + (suf === 'ly' ? 'l' : ''))) {
      const tail = suf === 'fully' ? [original.slice(-5, -2), original.slice(-2)] : [original.slice(-suf.length)];
      return [...syllables(original.slice(0, -suf.length)), ...tail];
    }
  }

  // locate vowel groups
  const groups = [];
  for (let i = 0; i < w.length; ) {
    if (isVowelAt(w, i)) {
      let j = i + 1;
      while (j < w.length && isVowelAt(w, j)) j++;
      groups.push([i, j]);
      i = j;
    } else i++;
  }
  // silent final e ("make", "time") — but not "-le" ("table") or "the"
  const last = groups[groups.length - 1];
  if (groups.length > 1 && last && last[0] === w.length - 1 && w.endsWith('e') && !/[^aeiou]le$/.test(w)) groups.pop();
  // "-ed" is silent unless after t/d ("jumped" vs "wanted")
  // ...but it is pronounced after a consonant + r/l cluster ("hundred", "sacred")
  if (groups.length > 1 && /[^aeioutd]ed$/.test(w) && !/[^aeiou][rl]ed$/.test(w)) {
    const g = groups[groups.length - 1];
    if (g[0] === w.length - 2) groups.pop();
  }
  // split vowel groups that are two separate sounds ("di-et", "li-on")
  const split = [];
  for (const [a, b] of groups) {
    const seg = w.slice(a, b);
    if (b - a === 2 && !DIPHTHONGS.has(seg)) split.push([a, a + 1], [a + 1, b]);
    else split.push([a, b]);
  }
  if (split.length <= 1) return [original];

  const cuts = [];
  for (let k = 0; k < split.length - 1; k++) {
    const start = split[k][1];
    const end = split[k + 1][0];
    const cluster = w.slice(start, end);
    let cut;
    if (cluster.length === 0) cut = start;
    else if (cluster.length === 1) cut = start; // V/CV: ti-ger
    else if (/le$/.test(w) && k === split.length - 2 && end === w.length - 1 && w[end] === 'e' && w[end - 1] === 'l') cut = end - 2; // ta-ble, pur-ple
    else if (cluster === 'ck') cut = end; // pock-et
    else if (KEEP.has(cluster)) cut = start; // fa-ther, ki-ng? -> handled by length
    else {
      // keep the longest valid onset (up to 3 letters) with the next syllable, at least 1 consonant stays behind
      cut = start + 1;
      for (let len = Math.min(3, cluster.length - 1); len >= 2; len--) {
        if (ONSETS.has(cluster.slice(cluster.length - len))) {
          cut = end - len;
          break;
        }
      }
      // a doubled consonant always splits in the middle: rab-bit, hap-py
      if (cluster.length === 2 && cluster[0] === cluster[1]) cut = start + 1;
      // digraph at the front of the cluster stays behind: kitch-en, pump-kin
      if (KEEP.has(cluster.slice(0, 2)) && cluster.length > 2) cut = Math.max(cut, start + 2);
    }
    cuts.push(cut);
  }
  const parts = [];
  let prev = 0;
  for (const c of cuts) {
    if (c > prev && c < w.length) {
      parts.push(original.slice(prev, c));
      prev = c;
    }
  }
  parts.push(original.slice(prev));
  return parts.filter(Boolean);
};
