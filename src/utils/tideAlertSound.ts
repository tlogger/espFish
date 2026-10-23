// ExFish 갯바위 들물 고립 방지 사운드 신디사이저 엔진 (Phase 3)
// Web Audio API 기반 긴급 대피 비프 및 고출력 2단 사이렌 사운드

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * 긴급 비프 경보음 (880Hz -> 440Hz 2단 펄스 경고음)
 */
export function playEvacuationBeep(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 경고음
    osc.frequency.setValueAtTime(440, ctx.currentTime + 0.15); // A4

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {
    console.warn('Audio alert failed:', e);
  }
}

/**
 * 현장 고출력 비상 사이렌 (파도/바람 소리를 뚫는 3단 급박 사이렌)
 */
export function playEvacuationSiren(cycles = 3): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const startTime = ctx.currentTime;
    for (let i = 0; i < cycles; i++) {
      const cycleStart = startTime + i * 0.45;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth'; // 침투력 높은 톱니파
      osc.frequency.setValueAtTime(960, cycleStart);
      osc.frequency.exponentialRampToValueAtTime(520, cycleStart + 0.22);
      osc.frequency.exponentialRampToValueAtTime(960, cycleStart + 0.44);

      gain.gain.setValueAtTime(0.35, cycleStart);
      gain.gain.exponentialRampToValueAtTime(0.01, cycleStart + 0.44);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(cycleStart);
      osc.stop(cycleStart + 0.45);
    }
  } catch (e) {
    console.warn('Audio siren alert failed:', e);
  }
}

