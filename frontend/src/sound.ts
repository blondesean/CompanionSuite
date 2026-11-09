// The "task done" sound: a crisp click followed by a soft two-note chime,
// synthesized with Web Audio so there's no audio file to load. Follows the
// iPhone's silent switch.

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(ac: AudioContext, frequency: number, start: number, duration: number, volume: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function click(ac: AudioContext, start: number) {
  const length = Math.floor(ac.sampleRate * 0.025);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 4);
  const source = ac.createBufferSource();
  source.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 3200;
  filter.Q.value = 0.8;
  const gain = ac.createGain();
  gain.gain.value = 0.9;
  source.connect(filter).connect(gain).connect(ac.destination);
  source.start(start);
}

export function playComplete(): void {
  try {
    const ac = context();
    if (!ac) return;
    const t = ac.currentTime + 0.005;
    click(ac, t);
    tone(ac, 1046.5, t + 0.01, 0.18, 0.22); // C6
    tone(ac, 1568, t + 0.075, 0.32, 0.18); // G6
  } catch {
    // Sound is a nicety; never let it break completing a task.
  }
}
