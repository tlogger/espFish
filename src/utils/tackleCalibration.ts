// ExFish 유저 맞춤형 공기역학 채비 및 로드 탄성 비거리 & 수중 침강(폴링) 물리 엔진
// 1. 낚싯대 파워(UL~XH) 탄성 곡선 + 로드 길이(ft) 레버 암 공식
// 2. 루어/싱커 무게(g) + 합사 PE 라인 공기저항 비거리 계산
// 3. 착수 수심(m) 및 조류 유속(m/s)을 고려한 유효 침강 속도, 바닥 안착 소요 시간, 조류 흘림 거리 산출

export type RodPower = 'UL' | 'L' | 'ML' | 'M' | 'MH' | 'H' | 'XH';

export interface RodPowerSpec {
  power: RodPower;
  label: string;
  optWeightG: number;
  minWeightG: number;
  maxWeightG: number;
  description: string;
}

export const ROD_POWER_SPECS: Record<RodPower, RodPowerSpec> = {
  UL: { power: 'UL', label: 'UL (울트라라이트)', optWeightG: 3, minWeightG: 1, maxWeightG: 7, description: '아징/볼락 지그헤드' },
  L:  { power: 'L',  label: 'L (라이트)', optWeightG: 7, minWeightG: 3, maxWeightG: 12, description: '호래기/우럭 다운샷' },
  ML: { power: 'ML', label: 'ML (미디엄라이트)', optWeightG: 18, minWeightG: 7, maxWeightG: 30, description: '주꾸미/갑오징어 에기/라이트루어 (7~30g)' },
  M:  { power: 'M',  label: 'M (미디엄 표준)', optWeightG: 22, minWeightG: 10, maxWeightG: 35, description: '에깅 3.5호/광어 다운샷' },
  MH: { power: 'MH', label: 'MH (미디엄헤비)', optWeightG: 32, minWeightG: 14, maxWeightG: 50, description: '농어 미노우/삼치/쇼어 (~50g)' },
  H:  { power: 'H',  label: 'H (헤비)', optWeightG: 60, minWeightG: 30, maxWeightG: 90, description: '쇼어지깅 메탈/대물' },
  XH: { power: 'XH', label: 'XH (엑스트라헤비)', optWeightG: 100, minWeightG: 50, maxWeightG: 150, description: '원투 서프/헤비지깅' },
};

const KEY_RIG_WEIGHT = 'exfish_rig_weight_g';
const KEY_PE_LINE = 'exfish_pe_line_size';
const KEY_ROD_POWER = 'exfish_rod_power';
const KEY_ROD_LENGTH = 'exfish_rod_length_ft';

export interface TackleRigConfig {
  weightGrams: number; // 3g ~ 120g
  peLineSize: number; // 0.4호 ~ 3.0호
  rodPower: RodPower; // UL ~ XH
  rodLengthFt: number; // 6.6ft ~ 14.8ft
  calibratedDistanceMeters: number; // 계산된 기준 비거리 (m)
  radii: [number, number, number]; // [단거리, 기준거리, 원거리]
  rodElasticityEfficiency: number; // 로드 탄성 효율 η (0.0 ~ 1.0)
  rodLengthFactor: number; // 로드 길이 계수 (1.0 기준)
}

/**
 * 낚싯대 파워(탄성), 전장(길이), 채비 무게, 합사 라인 굵기를 결합한 공기역학 비거리 산식
 * D = 55 * (Length/8.6)^0.65 * exp( - (ln W - ln W_opt)^2 / (2 * 0.55^2) ) * (1.0 / PE)^0.22
 */
export function calculateCalibratedDistance(
  weightGrams: number,
  peLineSize: number,
  rodPower: RodPower = 'M',
  rodLengthFt: number = 8.6
): {
  distanceMeters: number;
  elasticityEfficiency: number;
  lengthFactor: number;
} {
  const safeWeight = Math.max(1, Math.min(100, weightGrams));
  const safePE = Math.max(0.4, Math.min(3.0, peLineSize));
  const safeLength = Math.max(5.0, Math.min(16.0, rodLengthFt));

  // 1. 로드 길이 레버 암 계수 (8.6ft 표준 = 1.0)
  const lengthFactor = Math.pow(safeLength / 8.6, 0.65);

  // 2. 로드 파워 탄성 위치에너지 축적 및 복원 효율 (비대칭 가우시안 곡선)
  const spec = ROD_POWER_SPECS[rodPower] || ROD_POWER_SPECS.M;
  const optW = spec.optWeightG;
  const sigma = 0.55;
  const logRatio = Math.log(safeWeight) - Math.log(optW);
  const elasticityEfficiency = Math.exp(-(logRatio * logRatio) / (2 * sigma * sigma));

  // 3. 합사 PE 라인 공기역학 항력 계수
  const lineFactor = Math.pow(1.0 / safePE, 0.22);

  // 4. 표준 캐스팅 기준 거리 55m에 계수 융합
  const rawDist = 55.0 * lengthFactor * (0.35 + 0.65 * elasticityEfficiency) * lineFactor;

  // 최소 12m ~ 최대 130m 현실 필드 클램핑
  const distanceMeters = Math.round(Math.max(12, Math.min(130, rawDist)));

  return {
    distanceMeters,
    elasticityEfficiency: Math.round(elasticityEfficiency * 100) / 100,
    lengthFactor: Math.round(lengthFactor * 100) / 100,
  };
}

export interface CastingDriftResult {
  targetDistanceM: number;
  targetBearingDeg: number;
  actualDistanceM: number;
  actualBearingDeg: number;
  driftDistanceM: number;
  driftAngleDeg: number;
  flightTimeSec: number;
  headwindMps: number;
  crosswindMps: number;
}

/**
 * 지그헤드 + 2인치 쉐드 웜 채비 면적 및 합사(PE 라인) 길이/두께를 반영한
 * 실시간 풍향·풍속 비거리 변화 및 측면 편류(줄날림/밀림) 정밀 물리 산식
 */
export function calculateAerodynamicCastingDrift(
  targetBearingDeg: number,
  baseDistanceM: number,
  windSpeedMps: number,
  windDirectionDeg: number,
  weightGrams: number = 25,
  peLineSize: number = 1.0,
  wormLengthInches: number = 2.0
): CastingDriftResult {
  const safeWeight = Math.max(1, Math.min(100, weightGrams));
  const safePE = Math.max(0.4, Math.min(3.0, peLineSize));
  const safeWindSpeed = Math.max(0, windSpeedMps);

  // 1. 바람 진행 방위 (To) = (From + 180) % 360
  const windVectorDeg = (windDirectionDeg + 180) % 360;

  // 2. 사잇각 계산 (캐스팅 방향 기준 바람 진행 방향 사잇각)
  let angleDiff = (windVectorDeg - targetBearingDeg) % 360;
  if (angleDiff > 180) angleDiff -= 360;
  if (angleDiff < -180) angleDiff += 360;
  const alphaRad = (angleDiff * Math.PI) / 180;

  // 3. 종방향(순풍/역풍) 및 횡방향(측풍) 성분 분해
  const headwindMps = safeWindSpeed * Math.cos(alphaRad);
  const crosswindMps = safeWindSpeed * Math.sin(alphaRad);

  // 4. 종방향 바람에 의한 비거리 증감 (가벼운 채비 + 굵은 합사일수록 맞바람 손실 극대화)
  const weightPenalty = Math.pow(18 / (safeWeight + 5), 0.4);
  const peWindResistance = Math.pow(safePE, 0.2);
  let distRatio = 1.0;
  if (headwindMps >= 0) {
    distRatio += Math.min(0.35, (headwindMps / 10) * 0.25 / weightPenalty);
  } else {
    distRatio -= Math.min(0.40, (Math.abs(headwindMps) / 10) * 0.28 * weightPenalty * peWindResistance);
  }
  const effectiveDist = Math.max(8, Math.round(baseDistanceM * distRatio));

  // 5. 체공 시간 계산 (약 0.38 * sqrt(D))
  const flightTimeSec = Math.round(0.38 * Math.sqrt(effectiveDist) * 10) / 10;

  // 6. 채비(지그헤드 + 2인치 쉐드 웜) 및 합사 측면 공기역학 풍압력 산출
  // 2인치 쉐드 웜 투영 측면적: 5.08cm * 0.8cm + 지그헤드 ~ 0.00055 m^2
  const rigSideArea = (wormLengthInches * 0.0254 * 0.008) + 0.00015;
  // 합사: 직경 0.165mm * sqrt(PE), 방출 길이 effectiveDist * 1.08
  const lineDiam = 0.000165 * Math.sqrt(safePE);
  const lineArea = (effectiveDist * 1.08) * lineDiam;

  const absCross = Math.abs(crosswindMps);
  const dynamicPressure = 0.5 * 1.225 * absCross * absCross;
  // 라인 장력(로드팁-루어 앵커)을 고려한 유효 수풍력
  const fCross = dynamicPressure * (0.65 * rigSideArea + 0.35 * 1.1 * lineArea);
  const mKg = safeWeight / 1000;
  const aCross = fCross / mKg;

  // 텐션 억제 감쇠 계수 및 라인 공기 연행력
  const tensionDamping = 0.38;
  let driftM = 0.5 * aCross * flightTimeSec * flightTimeSec * tensionDamping + absCross * flightTimeSec * 0.06 * Math.sqrt(safePE);
  driftM = Math.min(effectiveDist * 0.35, driftM);
  const signedDrift = crosswindMps >= 0 ? driftM : -driftM;

  // 7. 목표 지점 벡터에 횡방향 오프셋 벡터 합성
  const radTarget = (targetBearingDeg * Math.PI) / 180;
  const xTarget = effectiveDist * Math.sin(radTarget);
  const yTarget = effectiveDist * Math.cos(radTarget);

  const radNormal = ((targetBearingDeg + 90) * Math.PI) / 180;
  const xActual = xTarget + signedDrift * Math.sin(radNormal);
  const yActual = yTarget + signedDrift * Math.cos(radNormal);

  const actualDistanceM = Math.round(Math.sqrt(xActual * xActual + yActual * yActual));
  let actualBearingRad = Math.atan2(xActual, yActual);
  let actualBearingDeg = Math.round(((actualBearingRad * 180) / Math.PI + 360) % 360);

  let driftAngleDeg = (actualBearingDeg - targetBearingDeg) % 360;
  if (driftAngleDeg > 180) driftAngleDeg -= 360;
  if (driftAngleDeg < -180) driftAngleDeg += 360;

  return {
    targetDistanceM: effectiveDist,
    targetBearingDeg,
    actualDistanceM,
    actualBearingDeg,
    driftDistanceM: Math.round(driftM * 10) / 10,
    driftAngleDeg,
    flightTimeSec,
    headwindMps: Math.round(headwindMps * 10) / 10,
    crosswindMps: Math.round(crosswindMps * 10) / 10,
  };
}

/**
 * 수중 침강 물리 및 조류 연동 폴링(바닥 안착) 시간 & 조류 흘림 거리 산출
 * @param weightGrams 루어/싱커 무게 (g)
 * @param depthMeters 착수 지점 수심 (m)
 * @param currentVelocityMps 실시간 조류 유속 (m/s)
 */
export function calculateSinkingPhysics(
  weightGrams: number,
  depthMeters: number,
  currentVelocityMps: number = 0.3
): {
  sinkSpeedMps: number;
  effSinkSpeedMps: number;
  fallTimeSec: number;
  driftDistanceM: number;
} {
  const safeWeight = Math.max(1, Math.min(100, weightGrams));
  const safeDepth = Math.max(1.0, Math.min(60, depthMeters));
  const safeCurrent = Math.max(0.0, Math.min(3.0, currentVelocityMps));

  // 1. 정지 수역 수중 종단 침강 속도 (고밀도 메탈/납 싱커 근사: v_sink = 0.28 * sqrt(W))
  // 현실 필드: 3g=0.48m/s, 14g=1.05m/s, 30g=1.53m/s, 60g=2.17m/s
  const rawSinkSpeed = 0.28 * Math.sqrt(safeWeight);
  const sinkSpeedMps = Math.round(Math.max(0.35, Math.min(2.5, rawSinkSpeed)) * 100) / 100;

  // 2. 조류에 의한 원줄(합사) 배불뚝이(Belly) 양력 감쇄 효과
  // v_eff = v_sink / sqrt(1 + (V_cur / (0.6 * v_sink))^2)
  const currentRatio = safeCurrent / (0.6 * sinkSpeedMps);
  const effSinkSpeedMps = Math.round((sinkSpeedMps / Math.sqrt(1 + currentRatio * currentRatio)) * 100) / 100;

  // 3. 바닥 안착(폴링) 총 소요 시간 (초)
  const fallTimeSec = Math.max(1, Math.round(safeDepth / Math.max(0.2, effSinkSpeedMps)));

  // 4. 침강 중 조류 방향으로 밀려가는 흘림 거리 (m)
  const driftDistanceM = Math.round(safeCurrent * fallTimeSec * 10) / 10;

  return {
    sinkSpeedMps,
    effSinkSpeedMps,
    fallTimeSec,
    driftDistanceM,
  };
}

export function getSavedTackleConfig(): TackleRigConfig {
  let weight = 25;
  let pe = 1.0;
  let rodPower: RodPower = 'M';
  let rodLengthFt = 8.6;

  if (typeof window !== 'undefined') {
    try {
      const savedW = localStorage.getItem(KEY_RIG_WEIGHT);
      const savedPE = localStorage.getItem(KEY_PE_LINE);
      const savedPower = localStorage.getItem(KEY_ROD_POWER) as RodPower | null;
      const savedLength = localStorage.getItem(KEY_ROD_LENGTH);

      if (savedW) weight = parseFloat(savedW) || 25;
      if (savedPE) pe = parseFloat(savedPE) || 1.0;
      if (savedPower && ROD_POWER_SPECS[savedPower]) rodPower = savedPower;
      if (savedLength) rodLengthFt = parseFloat(savedLength) || 8.6;
    } catch {
      // ignore
    }
  }

  const { distanceMeters, elasticityEfficiency, lengthFactor } = calculateCalibratedDistance(
    weight,
    pe,
    rodPower,
    rodLengthFt
  );

  const r1 = Math.round(distanceMeters * 0.5);
  const r2 = distanceMeters;
  const r3 = Math.round(distanceMeters * 1.5);

  return {
    weightGrams: weight,
    peLineSize: pe,
    rodPower,
    rodLengthFt,
    calibratedDistanceMeters: distanceMeters,
    radii: [r1, r2, r3],
    rodElasticityEfficiency: elasticityEfficiency,
    rodLengthFactor: lengthFactor,
  };
}

export function saveTackleConfig(
  weightGrams: number,
  peLineSize: number,
  rodPower?: RodPower,
  rodLengthFt?: number
): TackleRigConfig {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(KEY_RIG_WEIGHT, String(weightGrams));
      localStorage.setItem(KEY_PE_LINE, String(peLineSize));
      if (rodPower) localStorage.setItem(KEY_ROD_POWER, rodPower);
      if (rodLengthFt) localStorage.setItem(KEY_ROD_LENGTH, String(rodLengthFt));

      window.dispatchEvent(
        new CustomEvent('exfish_tackle_updated', {
          detail: { weightGrams, peLineSize, rodPower, rodLengthFt },
        })
      );
    } catch {
      // ignore
    }
  }
  return getSavedTackleConfig();
}
