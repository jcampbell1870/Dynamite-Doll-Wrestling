// Synthesised audio: crowd ambience, impacts, ring bell, referee count and
// pyro. Everything is generated with Web Audio so the game ships no sound files.
export function createAudio() {
  let ctx = null;
  let master = null;
  let crowdGain = null;
  let crowdFilter = null;
  let noiseBuffer = null;
  let volume = 0.8;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      return true;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      return false;
    }

    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume;
    const compressor = ctx.createDynamicsCompressor();
    master.connect(compressor);
    compressor.connect(ctx.destination);

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.02 * white) / 1.02;
      data[i] = brown * 3.5 * 0.6 + white * 0.4;
    }

    // Looping crowd murmur.
    const crowd = ctx.createBufferSource();
    crowd.buffer = noiseBuffer;
    crowd.loop = true;
    crowdFilter = ctx.createBiquadFilter();
    crowdFilter.type = 'bandpass';
    crowdFilter.frequency.value = 700;
    crowdFilter.Q.value = 0.6;
    crowdGain = ctx.createGain();
    crowdGain.gain.value = 0.12;
    crowd.connect(crowdFilter);
    crowdFilter.connect(crowdGain);
    crowdGain.connect(master);
    crowd.start();
    return true;
  }

  function noiseBurst(duration, frequency, gain, type) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = frequency;
    const env = ctx.createGain();
    const now = ctx.currentTime;
    env.gain.setValueAtTime(gain, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(env);
    env.connect(master);
    source.start(now, Math.random() * 1.5);
    source.stop(now + duration + 0.05);
  }

  function tone(frequency, endFrequency, duration, gain, type) {
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    const env = ctx.createGain();
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    env.gain.setValueAtTime(gain, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(env);
    env.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  return {
    unlock() {
      ensure();
    },
    setVolume(value) {
      volume = value;
      if (master) {
        master.gain.value = value;
      }
    },
    setExcitement(value) {
      if (!ctx) {
        return;
      }
      const now = ctx.currentTime;
      crowdGain.gain.setTargetAtTime(0.08 + value * 0.32, now, 0.3);
      crowdFilter.frequency.setTargetAtTime(500 + value * 900, now, 0.3);
    },
    strike() {
      if (!ensure()) { return; }
      noiseBurst(0.12, 3200, 0.7, 'highpass');
      tone(180, 60, 0.12, 0.5);
    },
    slam(heavy) {
      if (!ensure()) { return; }
      tone(heavy ? 90 : 120, 32, heavy ? 0.55 : 0.35, heavy ? 1 : 0.8);
      noiseBurst(heavy ? 0.45 : 0.3, 900, heavy ? 0.9 : 0.6);
    },
    whoosh() {
      if (!ensure()) { return; }
      noiseBurst(0.18, 1800, 0.25, 'bandpass');
    },
    count() {
      if (!ensure()) { return; }
      tone(140, 50, 0.18, 0.7);
      noiseBurst(0.12, 1500, 0.4);
    },
    bell() {
      if (!ensure()) { return; }
      [1, 2.76, 5.4].forEach((ratio, i) => {
        tone(820 * ratio, 820 * ratio * 0.995, 1.4 - i * 0.3, 0.22 / (i + 1), 'sine');
      });
    },
    pyro() {
      if (!ensure()) { return; }
      tone(70, 25, 0.9, 1);
      noiseBurst(1.2, 600, 0.9);
    },
    ui() {
      if (!ensure()) { return; }
      tone(660, 880, 0.06, 0.12, 'triangle');
    }
  };
}
