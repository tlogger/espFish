import { BiteScoreBreakdown, FishingSpot, MarineData, TideDayInfo, WeatherData } from '../types';

/** 대상어종별 최적 활성 수온 대역(°C) 데이터베이스 */
export const SPECIES_TEMP_MAP: Record<string, { min: number; optMin: number; optMax: number; max: number }> = {
  감성돔: { min: 11, optMin: 14, optMax: 19, max: 24 },
  참돔: { min: 13, optMin: 16, optMax: 22, max: 26 },
  벵에돔: { min: 14, optMin: 17, optMax: 23, max: 27 },
  농어: { min: 10, optMin: 14, optMax: 21, max: 25 },
  우럭: { min: 7, optMin: 11, optMax: 17, max: 22 },
  광어: { min: 9, optMin: 13, optMax: 19, max: 24 },
  노래미: { min: 6, optMin: 10, optMax: 16, max: 21 },
  볼락: { min: 8, optMin: 11, optMax: 16, max: 20 },
  무늬오징어: { min: 15, optMin: 17, optMax: 23, max: 27 },
  갑오징어: { min: 13, optMin: 15, optMax: 21, max: 25 },
  고등어: { min: 14, optMin: 17, optMax: 22, max: 26 },
  전갱이: { min: 14, optMin: 17, optMax: 23, max: 27 },
  삼치: { min: 15, optMin: 18, optMax: 24, max: 28 },
};

/**
 * Esper AI 입질 지수 (Bite Index, 100점 만점) 및 바람/안전 판정 계산기
 */
export function calculateBiteScore(
  spot: FishingSpot,
  weather: WeatherData,
  marine: MarineData,
  tide: TideDayInfo
): BiteScoreBreakdown {
  // 1. 물때 일치도 (최대 30점)
  let mulScore = 20; // 기본 점수
  if (spot.best_tides && spot.best_tides.length > 0) {
    const isMatched = spot.best_tides.some(
      (t) => t.includes(`${tide.mulNumber}물`) || (tide.mulNumber >= 6 && tide.mulNumber <= 10 && t.includes('사리'))
    );
    mulScore = isMatched ? 30 : 16;
  } else {
    // 6~9물(사리) 또는 1~3물 등 일반적 조류 흐름 반영
    if (tide.mulNumber >= 6 && tide.mulNumber <= 9) mulScore = 28;
    else if (tide.mulNumber === 14 || tide.mulNumber === 15) mulScore = 15;
    else mulScore = 22;
  }

  // 2. 바람 & 안전 적합도 (최대 25점)
  // 풍속에 따른 감점 (m/s)
  let windScore = 25;
  const speed = weather.windSpeed;
  if (speed <= 4.0) windScore = 25;
  else if (speed <= 6.5) windScore = 20;
  else if (speed <= 8.5) windScore = 13;
  else windScore = 5; // 강풍 주의

  // 풍향과 포인트 해안선 배향에 따른 등바람 vs 맞바람 판정
  // 기본적으로 남해안/동해안/서해안 기준 또는 단순 각도 차이 분석
  let windRelation: BiteScoreBreakdown['windRelation'] = '등바람 (최적)';
  if (speed > 7.0 || marine.waveHeight > 1.5) {
    windRelation = '맞바람/너울 (위험)';
    windScore = Math.max(5, windScore - 6);
  } else if (speed > 4.5) {
    windRelation = '옆바람 (주의)';
  } else {
    windRelation = '등바람 (최적)';
  }

  // 3. 수온 활성도 (최대 25점)
  let tempScore = 20;
  const currentSst = marine.seaSurfaceTemp;
  const target = spot.target_species[0] || '우럭';
  const range = SPECIES_TEMP_MAP[target] || { min: 10, optMin: 14, optMax: 20, max: 25 };

  if (currentSst >= range.optMin && currentSst <= range.optMax) {
    tempScore = 25; // 최적 수온
  } else if (currentSst >= range.min && currentSst <= range.max) {
    tempScore = 18; // 보통
  } else {
    tempScore = 10; // 비활성 저수온/고수온
  }

  // 4. 피딩 타임 및 시간대 (최대 20점)
  let timeScore = 15;
  const now = new Date();
  const currentHour = now.getHours();

  // 일출(새벽 해창) or 일몰(초저녁 피딩) 전후 2시간대 가산점
  const isDawnOrDusk = (currentHour >= 5 && currentHour <= 8) || (currentHour >= 17 && currentHour <= 20);
  if (isDawnOrDusk) {
    timeScore = 20;
  } else if (currentHour >= 21 || currentHour <= 4) {
    timeScore = 14; // 야간
  } else {
    timeScore = 12; // 낮 피딩
  }

  const totalScore = Math.min(100, mulScore + windScore + tempScore + timeScore);

  // 실전 브리핑 코멘트 생성
  let verdict = '';
  if (totalScore >= 85) {
    verdict = `🔥 특급 출조 찬스 (${totalScore}점)! ${target} 활성수온(${currentSst}°C)과 ${tide.mulText} 조류가 완벽합니다.`;
  } else if (totalScore >= 70) {
    verdict = `✨ 좋은 조황 기대 (${totalScore}점). 풍속 ${weather.windSpeed}m/s로 안정적이며 입질 타임 진입 중입니다.`;
  } else if (totalScore >= 50) {
    verdict = `⚖️ 무난한 여건 (${totalScore}점). 조류 흐름과 중들물 타이밍을 집중 공략하세요.`;
  } else {
    verdict = `⚠️ 까다로운 여건 (${totalScore}점). 바람 또는 너울 파고에 주의하시고 안전 장구를 착용하세요.`;
  }

  return {
    totalScore,
    mulScore,
    windScore,
    tempScore,
    timeScore,
    windRelation,
    verdict,
  };
}
