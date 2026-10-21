// ExFish 유저 맞춤형 공기역학 채비 항력 계수(Cd) 비거리 캘리브레이터
// 루어/싱커 무게(g) 및 합사 라인 호수(PE)에 따른 물리 기준 비거리 동적 산출

const KEY_RIG_WEIGHT = 'exfish_rig_weight_g';
const KEY_PE_LINE = 'exfish_pe_line_size';

export interface TackleRigConfig {
  weightGrams: number; // 3g ~ 100g
  peLineSize: number; // 0.4호 ~ 3.0호
  calibratedDistanceMeters: number; // 계산된 기준 비거리 (m)
  radii: [number, number, number]; // [단거리, 기준거리, 원거리]
}

/**
 * 물리 공기역학 모델 기반 기준 캐스팅 비거리 연산
 * D_base = 60 * sqrt(W / 25) * (1.0 / PE)^0.25
 */
export function calculateCalibratedDistance(weightGrams: number, peLineSize: number): number {
  const safeWeight = Math.max(3, Math.min(100, weightGrams));
  const safePE = Math.max(0.4, Math.min(3.0, peLineSize));

  const weightFactor = Math.sqrt(safeWeight / 25.0);
  const lineFactor = Math.pow(1.0 / safePE, 0.25);

  const rawDist = 60.0 * weightFactor * lineFactor;
  // 현실 필드 최소 15m ~ 최대 110m 클램핑
  return Math.round(Math.max(15, Math.min(110, rawDist)));
}

export function getSavedTackleConfig(): TackleRigConfig {
  let weight = 25;
  let pe = 1.0;

  if (typeof window !== 'undefined') {
    try {
      const savedW = localStorage.getItem(KEY_RIG_WEIGHT);
      const savedPE = localStorage.getItem(KEY_PE_LINE);
      if (savedW) weight = parseFloat(savedW) || 25;
      if (savedPE) pe = parseFloat(savedPE) || 1.0;
    } catch {
      // ignore
    }
  }

  const dist = calculateCalibratedDistance(weight, pe);
  const r1 = Math.round(dist * 0.5);
  const r2 = dist;
  const r3 = Math.round(dist * 1.5);

  return {
    weightGrams: weight,
    peLineSize: pe,
    calibratedDistanceMeters: dist,
    radii: [r1, r2, r3],
  };
}

export function saveTackleConfig(weightGrams: number, peLineSize: number): TackleRigConfig {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(KEY_RIG_WEIGHT, String(weightGrams));
      localStorage.setItem(KEY_PE_LINE, String(peLineSize));
      window.dispatchEvent(new CustomEvent('exfish_tackle_updated', {
        detail: { weightGrams, peLineSize }
      }));
    } catch {
      // ignore
    }
  }
  return getSavedTackleConfig();
}
