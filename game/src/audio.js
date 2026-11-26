// All sound is synthesised with WebAudio: an engine drone that follows the
// throttle, a chime for a ring, a thud for a touchdown and a rumble for a
// crash. No audio files, no network — and nothing starts until the player
// first presses a key or clicks, as browsers require.
export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let windSource = null;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = context.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 110;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      const osc2Gain = context.createGain();
      osc2Gain.gain.value = 0.4;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(osc2Gain);
      osc2Gain.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(context.destination);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped noise through a band-pass, louder the faster you fly.
      const noiseLength = context.sampleRate;
      const noiseBuffer = context.createBuffer(1, noiseLength, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let index = 0; index < noiseLength; index += 1) data[index] = Math.random() * 2 - 1;
      windSource = context.createBufferSource();
      windSource.buffer = noiseBuffer;
      windSource.loop = true;
      const windFilter = context.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windGain = context.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(context.destination);
      windSource.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(frequency, duration, type, volume, when = 0) {
    if (!context) return;
    const start = context.currentTime + when;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  function thud(volume) {
    if (!context) return;
    const start = context.currentTime;
    const noiseLength = Math.floor(context.sampleRate * 0.25);
    const buffer = context.createBuffer(1, noiseLength, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < noiseLength; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / noiseLength);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    source.start(start);
  }

  return {
    /** Call from any user gesture; safe to call every frame. */
    unlock() { ensure(); },
    /** Continuous engine and wind, following throttle and speed. */
    update(throttle, speed, airborne) {
      if (!context || !engineOsc) return;
      const now = context.currentTime;
      const rpm = 50 + throttle * 75 + speed * 0.35;
      engineOsc.frequency.setTargetAtTime(rpm, now, 0.08);
      engineOsc2.frequency.setTargetAtTime(rpm * 2.02, now, 0.08);
      engineGain.gain.setTargetAtTime(airborne ? 0.05 + throttle * 0.05 : 0.02 + throttle * 0.05, now, 0.1);
      windGain.gain.setTargetAtTime(airborne ? Math.min(0.12, speed * 0.0012) : 0, now, 0.15);
    },
    ring() {
      blip(880, 0.35, 'sine', 0.22);
      blip(1318, 0.5, 'sine', 0.18, 0.09);
    },
    waypoint() {
      blip(659, 0.3, 'sine', 0.2);
      blip(988, 0.45, 'sine', 0.18, 0.08);
    },
    takeoff() { blip(523, 0.25, 'triangle', 0.18); },
    touchdown() { thud(0.5); },
    warning() {
      blip(440, 0.12, 'square', 0.1);
      blip(440, 0.12, 'square', 0.1, 0.18);
    },
    crash() {
      thud(0.9);
      blip(98, 0.8, 'sawtooth', 0.25);
    },
    complete() {
      blip(523, 0.3, 'sine', 0.2);
      blip(659, 0.3, 'sine', 0.2, 0.12);
      blip(784, 0.55, 'sine', 0.22, 0.24);
    },
  };
}
