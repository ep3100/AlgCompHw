// Pitch class
const PC_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

/**
 * Transpose a pitch class set by n semitones.
 * T_n(pc) = (pc + n) mod 12
 */
function transpose(pcs, n) {
  return pcs.map(pc => ((pc + n) % 12 + 12) % 12);
}

/**
 * Invert a pitch class set around a given axis.
 * I_axis(pc) = (axis - pc) mod 12
 */
function invert(pcs, axis = 0) {
  return pcs.map(pc => ((axis - pc) % 12 + 12) % 12);
}

/**
 * Retrograde — reverse the order of pitch classes.
 */
function retrograde(pcs) {
  return [...pcs].reverse();
}

function parsePCS(str) {
  const nums = str.split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && n >= 0 && n <= 11);
  return nums.length > 0 ? nums : null;
}

function parseWeights(str) {
  const w = str.split(',')
    .map(s => parseFloat(s.trim()))
    .filter(n => !isNaN(n) && n > 0);
  return w.length === 3 ? w : [2, 1, 1];
}

function weightedRandom(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

/**
 * Generate a composition by starting with a seed pitch class set
 * and randomly applying transpose, invert, and retrograde operations.
 */
function generateComposition(seed, numOps, weights) {
  const steps = [];
  let current = [...seed];
  steps.push({ op: 'Seed', label: '', pcs: [...current] });

  for (let i = 0; i < numOps; i++) {
    const choice = weightedRandom(weights);

    if (choice === 0) {
      const n = Math.floor(Math.random() * 11) + 1;
      current = transpose(current, n);
      steps.push({ op: 'T', label: `T${n}`, pcs: [...current] });
    } else if (choice === 1) {
      const axis = Math.floor(Math.random() * 12);
      current = invert(current, axis);
      steps.push({ op: 'I', label: `I${axis}`, pcs: [...current] });
    } else {
      current = retrograde(current);
      steps.push({ op: 'R', label: 'R', pcs: [...current] });
    }
  }
  return steps;
}

// Web Audio

let audioCtx = null;
let playTimeout = null;
let isPlaying = false;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function playNote(freq, duration, waveform) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = waveform;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

function playComposition(steps, noteDur, baseOctave, waveform, onNote, onDone) {
  const allNotes = [];
  steps.forEach((step, si) => {
    step.pcs.forEach((pc, ni) => {
      allNotes.push({ pc, stepIdx: si, noteIdx: ni, midi: pc + 12 * (baseOctave + 1) });
    });
  });

  isPlaying = true;
  let i = 0;
  function next() {
    if (!isPlaying || i >= allNotes.length) { isPlaying = false; onDone(); return; }
    const n = allNotes[i];
    playNote(midiToFreq(n.midi), (noteDur / 1000) * 1.5, waveform);
    onNote(n.stepIdx, n.noteIdx);
    i++;
    playTimeout = setTimeout(next, noteDur);
  }
  next();
}

function stopPlayback() {
  isPlaying = false;
  if (playTimeout) clearTimeout(playTimeout);
}

// Visualize piano

const OP_COLORS = { Seed: '#ecd87e', T: '#7ec8e3', I: '#c87eec', R: '#7eecb8' };

function drawPianoRoll(canvas, steps) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 12; i++) {
    const y = (i / 12) * H;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Pitch labels
  ctx.font = '9px monospace';
  ctx.fillStyle = '#444';
  for (let i = 0; i < 12; i++) {
    ctx.fillText(PC_NAMES[11 - i], 2, (i / 12) * H + H / 12 - 2);
  }

  // Notes
  const totalNotes = steps.reduce((a, s) => a + s.pcs.length, 0);
  const noteW = Math.max(4, (W - 24) / totalNotes);
  let x = 24;
  steps.forEach(step => {
    const color = OP_COLORS[step.op] || '#888';
    step.pcs.forEach(pc => {
      const y = ((11 - pc) / 12) * H;
      ctx.fillStyle = color;
      ctx.fillRect(x, y + 1, noteW - 1, H / 12 - 2);
      x += noteW;
    });
  });
}

function highlightNote(canvas, steps, stepIdx, noteIdx) {
  drawPianoRoll(canvas, steps);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const W = rect.width, H = rect.height;
  const totalNotes = steps.reduce((a, s) => a + s.pcs.length, 0);
  const noteW = Math.max(4, (W - 24) / totalNotes);

  let x = 24;
  for (let si = 0; si < steps.length; si++) {
    for (let ni = 0; ni < steps[si].pcs.length; ni++) {
      if (si === stepIdx && ni === noteIdx) {
        const pc = steps[si].pcs[ni];
        const y = ((11 - pc) / 12) * H;
        ctx.save();
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 10 * dpr;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x * dpr, (y + 1) * dpr, (noteW - 1) * dpr, (H / 12 - 2) * dpr);
        ctx.restore();
        return;
      }
      x += noteW;
    }
  }
}

// UI and Events

let composition = null;
const generateBtn = document.getElementById('generateBtn');
const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const seqDisplay = document.getElementById('seqDisplay');
const rollCanvas = document.getElementById('rollCanvas');

function renderSequence(steps) {
  let html = '';
  steps.forEach((step, si) => {
    const cls = step.op === 'Seed' ? 'tag-seed' : `tag-${step.op}`;
    const label = step.op === 'Seed' ? 'Seed' : step.label;
    html += `<div><span class="tag ${cls}">${label}</span>`;
    step.pcs.forEach((pc, ni) => {
      html += `<span class="chip" data-step="${si}" data-note="${ni}">${PC_NAMES[pc]}</span>`;
    });
    html += `</div>`;
  });
  seqDisplay.innerHTML = html;
}

function highlightSequenceNote(si, ni) {
  document.querySelectorAll('.chip.active').forEach(el => el.classList.remove('active'));
  const el = document.querySelector(`.chip[data-step="${si}"][data-note="${ni}"]`);
  if (el) { el.classList.add('active'); el.scrollIntoView({ block: 'nearest' }); }
}

function clearHighlights() {
  document.querySelectorAll('.chip.active').forEach(el => el.classList.remove('active'));
}

generateBtn.addEventListener('click', () => {
  const pcs = parsePCS(document.getElementById('pcsInput').value);
  if (!pcs) { alert('Invalid pitch class set. Enter numbers 0-11, comma-separated.'); return; }
  const numOps = parseInt(document.getElementById('numOps').value, 10) || 8;
  const weights = parseWeights(document.getElementById('weights').value);
  composition = generateComposition(pcs, numOps, weights);
  renderSequence(composition);
  drawPianoRoll(rollCanvas, composition);
  playBtn.disabled = false;
});

playBtn.addEventListener('click', () => {
  if (!composition) return;
  const noteDur = parseInt(document.getElementById('noteDur').value, 10) || 300;
  const baseOctave = parseInt(document.getElementById('baseOctave').value, 10);
  const waveform = document.getElementById('waveform').value;
  playBtn.disabled = true;
  stopBtn.disabled = false;
  playComposition(composition, noteDur, baseOctave, waveform,
    (si, ni) => { highlightNote(rollCanvas, composition, si, ni); highlightSequenceNote(si, ni); },
    () => { playBtn.disabled = false; stopBtn.disabled = true; drawPianoRoll(rollCanvas, composition); clearHighlights(); }
  );
});

stopBtn.addEventListener('click', () => {
  stopPlayback();
  playBtn.disabled = false;
  stopBtn.disabled = true;
  if (composition) drawPianoRoll(rollCanvas, composition);
  clearHighlights();
});

window.addEventListener('resize', () => { if (composition) drawPianoRoll(rollCanvas, composition); });