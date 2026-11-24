import { cropAbove, dwellDetector, pickWord, syllables } from './reading.js';
import { drawSamplePage } from './sample.js';
import { fingertip, loadHands, loadOcr, readRegion } from './ai.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// ---------------- navigation ----------------
const VIEWS = ['read', 'words', 'about'];
const show = (name) => {
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== name;
  for (const t of $$('.tab')) {
    const on = t.dataset.view === name;
    t.classList.toggle('is-on', on);
    if (on) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  }
  if (name === 'words') renderWords();
};
for (const t of $$('.tab')) t.addEventListener('click', () => show(t.dataset.view));

// ---------------- speech ----------------
let voice = null;
const pickVoice = () => {
  const vs = speechSynthesis.getVoices();
  voice = vs.find((v) => /en[-_](US|GB)/i.test(v.lang) && v.localService) || vs.find((v) => /^en/i.test(v.lang)) || null;
};
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}
const say = (text, rate = 0.9) =>
  new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || 'en-US';
    u.rate = rate;
    u.pitch = 1.05;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
const stopSpeech = () => window.speechSynthesis?.cancel();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- my words (on-device only) ----------------
const KEY = 'pip:words';
const loadWords = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
};
const saveWords = (w) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(w));
  } catch {
    /* storage blocked */
  }
};
const remember = (word) => {
  const w = loadWords();
  const k = word.toLowerCase();
  w[k] = { word, count: (w[k]?.count ?? 0) + 1, last: Date.now(), known: false };
  saveWords(w);
  updateBadge();
};
const updateBadge = () => {
  const n = Object.keys(loadWords()).length;
  $('#word-count').textContent = n;
  $('#word-count').hidden = n === 0;
};
updateBadge();

// ---------------- word card ----------------
let current = null;
const showCard = (word) => {
  current = word;
  const parts = syllables(word);
  $('#w-word').textContent = word;
  const s = $('#w-syll');
  s.replaceChildren(
    ...parts.map((p, i) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = p;
      b.setAttribute('aria-label', `syllable ${i + 1}: ${p}`);
      b.addEventListener('click', () => {
        stopSpeech();
        say(p, 0.7);
      });
      return b;
    })
  );
  s.hidden = parts.length < 2;
  $('#card').hidden = false;
};
$('#w-say').addEventListener('click', () => current && (stopSpeech(), say(current)));
$('#w-slow').addEventListener('click', () => current && (stopSpeech(), say(current, 0.5)));
$('#w-parts').addEventListener('click', async () => {
  if (!current) return;
  stopSpeech();
  const parts = syllables(current);
  const chips = $$('#w-syll .chip');
  for (let i = 0; i < parts.length; i++) {
    chips[i]?.classList.add('lit');
    await say(parts[i], 0.65);
    chips[i]?.classList.remove('lit');
    await pause(220);
  }
  await say(current, 0.85);
});
$('#w-spell').addEventListener('click', async () => {
  if (!current) return;
  stopSpeech();
  await say(current.toUpperCase().split('').join(', '), 0.8);
  await pause(200);
  await say(current);
});

// ---------------- stage: camera or page ----------------
const video = $('#video');
const page = $('#page');
const overlay = $('#overlay');
const octx = overlay.getContext('2d');
const frame = $('#frame');
const status = (t) => ($('#status').textContent = t);

const state = {
  mode: null, // 'camera' | 'page'
  stream: null,
  facing: 'environment',
  source: null, // element OCR reads from
  tip: null,
  dwell: dwellDetector(),
  dwellStart: 0,
  busy: false,
  highlight: null, // {bbox, until}
  raf: 0,
};

const sourceSize = () =>
  state.mode === 'camera' ? { width: video.videoWidth, height: video.videoHeight } : { width: page.width, height: page.height };

const fitStage = () => {
  const { width, height } = sourceSize();
  if (!width) return;
  overlay.width = width;
  overlay.height = height;
  frame.style.aspectRatio = `${width} / ${height}`;
};

const lookUp = async (tip) => {
  if (state.busy) return;
  state.busy = true;
  status('Reading…');
  try {
    const size = sourceSize();
    const region = cropAbove(tip, size, { width: Math.round(size.width * 0.42), height: Math.round(size.height * 0.2) });
    const words = await readRegion(state.source, region);
    const hit = pickWord(words, tip);
    if (!hit) {
      status('I couldn’t find a word there. Try just under it.');
      return;
    }
    state.highlight = { bbox: hit.bbox, until: performance.now() + 2600 };
    showCard(hit.text);
    remember(hit.text);
    status(`“${hit.text}”`);
    stopSpeech();
    say(hit.text);
  } catch (e) {
    console.error(e);
    status('Something went wrong reading that. Try again.');
  } finally {
    state.busy = false;
  }
};

const draw = (now) => {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  const h = state.highlight;
  if (h && now < h.until) {
    const { x0, y0, x1, y1 } = h.bbox;
    const pad = 6;
    octx.fillStyle = 'rgba(255, 214, 10, 0.35)';
    octx.strokeStyle = '#ffb703';
    octx.lineWidth = 4;
    octx.beginPath();
    octx.roundRect(x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2, 10);
    octx.fill();
    octx.stroke();
  }
  const t = state.tip;
  if (t) {
    const held = state.dwellStart ? Math.min(1, (now - state.dwellStart) / 450) : 0;
    octx.lineWidth = 5;
    octx.strokeStyle = 'rgba(255,255,255,0.9)';
    octx.beginPath();
    octx.arc(t.x, t.y, 16, 0, Math.PI * 2);
    octx.stroke();
    if (held > 0) {
      octx.strokeStyle = '#7b61ff';
      octx.beginPath();
      octx.arc(t.x, t.y, 16, -Math.PI / 2, -Math.PI / 2 + held * Math.PI * 2);
      octx.stroke();
    }
    octx.fillStyle = state.busy ? '#ffb703' : '#7b61ff';
    octx.beginPath();
    octx.arc(t.x, t.y, 6, 0, Math.PI * 2);
    octx.fill();
  }
};

let lastTipMove = null;
const feedTip = (tip, now) => {
  if (!tip) {
    state.tip = null;
    state.dwellStart = 0;
    state.dwell(null);
    return;
  }
  state.tip = tip;
  if (!lastTipMove || Math.hypot(tip.x - lastTipMove.x, tip.y - lastTipMove.y) > 14) {
    lastTipMove = { x: tip.x, y: tip.y };
    state.dwellStart = now;
  }
  const fired = state.dwell({ x: tip.x, y: tip.y, t: now });
  if (fired) {
    state.dwellStart = 0;
    lookUp(fired);
  }
};

let lastVideoTime = -1;
const loop = () => {
  const now = performance.now();
  if (state.mode === 'camera' && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const t = fingertip(video, now);
    feedTip(t && t.pointing ? t : null, now);
  }
  draw(now);
  state.raf = requestAnimationFrame(loop);
};

const openStage = () => {
  $('#start').hidden = true;
  $('#stage').hidden = false;
  cancelAnimationFrame(state.raf);
  state.raf = requestAnimationFrame(loop);
};

const startCamera = async () => {
  openStage();
  state.mode = 'camera';
  state.source = video;
  video.hidden = false;
  page.hidden = true;
  $('#hint').textContent = 'Hold the book under the camera. Rest your fingertip just under a word and hold still.';
  status('Starting camera…');
  try {
    state.stream?.getTracks().forEach((t) => t.stop());
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    video.srcObject = state.stream;
    await video.play();
    fitStage();
    $('#flip').hidden = false;
    status('Loading Pip’s eyes…');
    await Promise.all([loadHands(), loadOcr()]);
    status('Ready! Point at a word.');
  } catch (e) {
    console.error(e);
    status('Camera not available. Try the sample page instead.');
  }
};

const startPage = async (img) => {
  openStage();
  stopCamera();
  state.mode = 'page';
  state.source = page;
  video.hidden = true;
  page.hidden = false;
  if (img) {
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    page.width = Math.round(img.naturalWidth * scale);
    page.height = Math.round(img.naturalHeight * scale);
    page.getContext('2d').drawImage(img, 0, 0, page.width, page.height);
  } else drawSamplePage(page);
  fitStage();
  $('#hint').textContent = 'Your mouse or finger is the pointer: rest it just under a word, or tap the word.';
  status('Loading Pip’s reader…');
  await loadOcr();
  status('Ready! Point at a word.');
};

const stopCamera = () => {
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
  $('#flip').hidden = true;
};

// pointer as a finger on page mode
const toSource = (e) => {
  const r = overlay.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * overlay.width, y: ((e.clientY - r.top) / r.height) * overlay.height };
};
overlay.addEventListener('pointermove', (e) => {
  if (state.mode !== 'page') return;
  feedTip(toSource(e), performance.now());
});
overlay.addEventListener('pointerleave', () => state.mode === 'page' && feedTip(null, performance.now()));
overlay.addEventListener('click', (e) => {
  if (state.mode !== 'page') return;
  // a tap lands *on* the word, so look slightly below the word's middle
  const p = toSource(e);
  lookUp({ x: p.x, y: p.y + 14 });
});

$('#use-camera').addEventListener('click', startCamera);
$('#use-sample').addEventListener('click', () => startPage(null));
$('#use-photo').addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => {
    startPage(img);
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(f); // stays on the device
});
$('#flip').addEventListener('click', () => {
  state.facing = state.facing === 'environment' ? 'user' : 'environment';
  startCamera();
});
$('#stop').addEventListener('click', () => {
  stopCamera();
  cancelAnimationFrame(state.raf);
  state.mode = null;
  state.tip = null;
  $('#stage').hidden = true;
  $('#start').hidden = false;
});

// ---------------- my words view ----------------
const renderWords = () => {
  const w = Object.values(loadWords()).sort((a, b) => b.last - a.last);
  const ul = $('#words');
  ul.replaceChildren(
    ...w.map((it) => {
      const li = document.createElement('li');
      li.className = it.known ? 'known' : '';
      const b = document.createElement('button');
      b.className = 'word-btn';
      b.textContent = it.word;
      b.addEventListener('click', () => (stopSpeech(), say(it.word)));
      const meta = document.createElement('span');
      meta.className = 'small';
      meta.textContent = `${syllables(it.word).join('·')}${it.count > 1 ? ` · asked ${it.count}×` : ''}${it.known ? ' · ✓ got it' : ''}`;
      li.append(b, meta);
      return li;
    })
  );
  $('#words-empty').hidden = w.length > 0;
  $('#practise').hidden = w.length === 0;
  $('#clear-words').hidden = w.length === 0;
};
$('#clear-words').addEventListener('click', () => {
  saveWords({});
  updateBadge();
  renderWords();
  $('#flash').hidden = true;
});

let deck = [];
const nextFlash = () => {
  if (!deck.length) {
    $('#flash-word').textContent = '🎉 All done!';
    $('#flash-progress').textContent = '';
    for (const b of ['#flash-check', '#flash-got', '#flash-again']) $(b).hidden = true;
    renderWords();
    return;
  }
  for (const b of ['#flash-check', '#flash-got', '#flash-again']) $(b).hidden = false;
  $('#flash-word').textContent = deck[0].word;
  $('#flash-progress').textContent = `${deck.length} to go`;
};
$('#practise').addEventListener('click', () => {
  deck = Object.values(loadWords())
    .filter((w) => !w.known)
    .sort(() => Math.random() - 0.5);
  if (!deck.length) deck = Object.values(loadWords());
  $('#flash').hidden = false;
  nextFlash();
});
$('#flash-check').addEventListener('click', () => deck[0] && (stopSpeech(), say(deck[0].word)));
$('#flash-got').addEventListener('click', () => {
  const w = loadWords();
  const k = deck[0].word.toLowerCase();
  if (w[k]) w[k].known = true;
  saveWords(w);
  deck.shift();
  nextFlash();
});
$('#flash-again').addEventListener('click', () => {
  deck.push(deck.shift());
  nextFlash();
});

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
