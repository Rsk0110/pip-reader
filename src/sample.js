// An original short story drawn onto a canvas as a "printed page", so the
// on-device OCR reads real pixels in demo mode (no camera or book needed).

export const STORY_TITLE = 'The Lantern Fox';
export const STORY = [
  'Every evening, a small red fox carried a paper lantern down to the edge of the meadow.',
  'The other animals laughed. “Foxes can see in the dark,” said the owl. “Why would you ever need a light?”',
  'The fox only smiled and kept walking. At the bottom of the hill lived a tiny hedgehog who was frightened of shadows.',
  'Each night the lantern glowed outside her door, and each night she slept a little more peacefully.',
];

const wrap = (ctx, text, maxWidth) => {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
};

/** Draws the story page into `canvas` (1200 × 900). */
export const drawSamplePage = (canvas) => {
  const W = 1200;
  const H = 900;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  // warm paper with a soft vignette
  const g = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 820);
  g.addColorStop(0, '#fffaf0');
  g.addColorStop(1, '#efe4cc');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#1d1a16';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 50px Georgia, "Times New Roman", serif';
  ctx.fillText(STORY_TITLE, 90, 120);

  ctx.font = '38px Georgia, "Times New Roman", serif';
  let y = 205;
  for (const para of STORY) {
    for (const line of wrap(ctx, para, W - 180)) {
      ctx.fillText(line, 90, y);
      y += 58;
    }
    y += 22;
  }
  ctx.font = 'italic 24px Georgia, serif';
  ctx.fillStyle = '#7a6f60';
  ctx.fillText('— 1 —', W / 2 - 30, H - 40);
};
