# Pip

**Point at a word in a real book. Hear it.**

Pip is a reading buddy for paper books. Hold a book under a phone or laptop camera and rest your fingertip just under a word you're stuck on. Pip finds your finger, reads the word above it, says it out loud, breaks it into syllables to sound out, and saves it to *My words* for practice.

**Try it:** https://rsk0110.github.io/pip-reader/ (on a laptop, tap **Try a sample page** to use your mouse as the finger).

## Why

Children learning to read, people with dyslexia, and anyone reading in a new language often get stuck on single words. The usual help is to stop, photograph or scan the page, or swap the book for a screen. Pip keeps the real book in your hands and helps one word at a time, like a parent sitting next to you, so the flow of reading isn't broken.

## How it works

1. **Hand tracking:** MediaPipe Hand Landmarker finds the index fingertip in each camera frame. Pip only reacts when the finger is pointing (tip above the knuckle).
2. **Dwell:** when the fingertip rests in one place for about half a second, Pip looks at a small band of the page just above it.
3. **Reading:** Tesseract (LSTM text recognition) reads only that band, upscaled and contrast-boosted, which keeps it fast.
4. **Picking the word:** Pip chooses the word whose baseline sits just above the fingertip and whose span covers it.
5. **Helping:**
   - highlights the word on the live view
   - says it with the device's own voice, with **Slowly**, **Sound it out** (syllable by syllable, chips light up) and **Spell it** options
   - saves it to *My words*, with flash-card practice

## Responsible AI

- **On-device:** both models ship with the site (`vendor/`) and run in the browser through WebAssembly and WebGL. Nothing is uploaded.
  - The page's Content Security Policy only allows its own origin (`connect-src 'self'`), so there's no third-party server to send anything to.
  - Camera frames are processed in memory and never stored.
- **Built for children's privacy:** there are no accounts, analytics or ads, and *My words* lives only in the browser's local storage.
- **Honest limits:**
  - Pip works best with printed text in good light; handwriting and decorative fonts are harder.
  - Syllables follow classroom rules (VC/CV, V/CV, consonant-le, silent e and common suffixes), so some words will be split differently from a dictionary.

## Develop

```bash
python -m http.server 8000   # open http://localhost:8000
npm test                     # reading logic tests (Node 20+)
```

`src/reading.js` holds the pure, unit-tested logic: `pickWord`, `dwellDetector`, `cropAbove` and `syllables`. `src/ai.js` loads the models, and `src/app.js` runs the camera, overlay, speech and word list.

## Third-party

- [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) and the Hand Landmarker model: Apache-2.0
- [Tesseract.js](https://github.com/naptha/tesseract.js), tesseract.js-core and the English `traineddata`: Apache-2.0

## AI disclosure

Built with Claude (Anthropic) as an AI coding assistant for design, code, tests and documentation. The sample story, "The Lantern Fox", is original.

## License

MIT (Pip's own code). Bundled third-party files keep their own licenses.
