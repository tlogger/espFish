import { BiteScoreBreakdown, FishingSpot, MarineData, SpeciesBiteScore, TideDayInfo, WeatherData } from '../types';
import { SPECIES_ENCYCLOPEDIA, SpeciesEcology } from './speciesDatabase';

/**
 * 특정 단일 어종의 현재 환경 적합도(0~100점) 정밀 채점기
 */
export function calculateSingleSpeciesScore(
  species: SpeciesEcology,
  spot: FishingSpot,
  weather: WeatherData,
  marine: MarineData,
  tide: TideDayInfo,
  currentHour: number,
  currentMonth: number
): SpeciesBiteScore {
  const sst = marine.seaSurfaceTemp;
  const wind = weather.windSpeed;
  const currentVel = marine.currentVelocity ?? 0.3;

  // 1. 수온 활성도 채점 (30점 만점)
  let tempScore = 15;
  let tempMatch = '보통 수온';
  const tr = species.tempRange;
  if (sst >= tr.optMin && sst <= tr.optMax) {
    tempScore = 30;
    tempMatch = `최적 활성수온 (${sst.toFixed(1)}°C)`;
  } else if (sst >= tr.min && sst <= tr.max) {
    // 최적 구간 근처
    tempScore = 20;
    tempMatch = `적정 수온 (${sst.toFixed(1)}°C)`;
  } else {
    // 생존 한계 초과 (저수온 또는 고수온 비활성)
    tempScore = 8;
    tempMatch = sst < tr.min ? `저수온 비활성 (${sst.toFixed(1)}°C)` : `고수온 비활성 (${sst.toFixed(1)}°C)`;
  }

  // 2. 어종별 일중 활동 시간대(주행성/야행성/피딩 타임) 정밀 적합도 (25점 만점 + 생태 페널티)
  let timeScore = 12;
  let activityMatch = '';
  let isStrictlyInactiveTime = false;

  const profile = species.dailyProfile;
  if (profile) {
    const isPeak = profile.peakHours.includes(currentHour);
    const isActive = profile.activeHours.includes(currentHour);

    if (profile.restriction === 'STRICT_DAY') {
      if (isPeak) {
        timeScore = 25;
        activityMatch = `주간 시각 사냥 최고 피크 (${currentHour}시 활성 극대화)`;
      } else if (isActive) {
        timeScore = 20;
        activityMatch = `주간 정상 먹이활동 시간대`;
      } else {
        timeScore = 2;
        activityMatch = `야간 비활성/휴면 (입질 전무: ${profile.timeNote})`;
        isStrictlyInactiveTime = true;
      }
    } else if (profile.restriction === 'STRICT_NIGHT') {
      if (isPeak) {
        timeScore = 25;
        activityMatch = `야간 집중 먹이 사냥 최고조 (${currentHour}시 골든타임)`;
      } else if (isActive) {
        timeScore = 20;
        activityMatch = `야간 먹이활동 시간대`;
      } else {
        timeScore = 2;
        activityMatch = `주간 은신/매몰 상태 (입질 불가: ${profile.timeNote})`;
        isStrictlyInactiveTime = true;
      }
    } else if (profile.restriction === 'CREPUSCULAR_PEAK') {
      if (isPeak) {
        timeScore = 25;
        activityMatch = `동틀녘/해창 황금 피딩 타임 (폭발적 입질 집중)`;
      } else if (isActive) {
        timeScore = 18;
        activityMatch = `피딩 전후 완만한 활동 시간대`;
      } else {
        timeScore = 7;
        activityMatch = `비피딩 시간대 (경계심 극대화, 깊은 은신처 위치)`;
      }
    } else {
      if (isPeak) {
        timeScore = 25;
        activityMatch = `최고 활성 시간대 (${profile.timeNote})`;
      } else {
        timeScore = 16;
        activityMatch = `통상 활동 시간대 (${profile.timeNote})`;
      }
    }
  } else {
    // 기본 생태 주기 폴백
    const isNight = currentHour >= 20 || currentHour <= 4;
    const isDay = currentHour >= 9 && currentHour <= 16;
    const isCrepuscular = (currentHour >= 5 && currentHour <= 8) || (currentHour >= 17 && currentHour <= 19);

    if (species.activityPeriod === 'NOCTURNAL') {
      if (isNight) {
        timeScore = 25;
        activityMatch = '야간 먹이활동 집중 (최고 활성)';
      } else if (isCrepuscular) {
        timeScore = 18;
        activityMatch = '어두워지는 피딩 진입';
      } else {
        timeScore = 5;
        activityMatch = '주간 은신 상태 (입질 뜸함)';
      }
    } else if (species.activityPeriod === 'DIURNAL') {
      if (isDay) {
        timeScore = 25;
        activityMatch = '주간 시각 사냥 최적';
      } else if (isCrepuscular) {
        timeScore = 16;
        activityMatch = '아침/오후 완만한 입질';
      } else {
        timeScore = 4;
        activityMatch = '야간 시야 부재 (입질 저하/휴면)';
      }
    } else {
      if (isCrepuscular) {
        timeScore = 25;
        activityMatch = '해창/일몰 골든타임 (폭발적)';
      } else if (isNight) {
        timeScore = 17;
        activityMatch = '야간 완만한 피딩';
      } else {
        timeScore = 14;
        activityMatch = '낮 시간대 무난';
      }
    }
  }

  // 3. 조류 유속 및 물때 적합도 (25점 만점)
  let currentScore = 16;
  if (species.currentPref === 'STRONG') {
    // 참돔, 감성돔, 농어, 방어: 사리 물때와 빠른 유속 선호
    if (tide.mulNumber >= 6 && tide.mulNumber <= 10 && currentVel >= 0.35) {
      currentScore = 25;
    } else if (currentVel >= 0.25) {
      currentScore = 20;
    } else {
      currentScore = 12;
    }
  } else if (species.currentPref === 'SLACK_GENTLE') {
    // 주꾸미, 갑오징어, 낙지, 도다리: 채비 안착과 바닥 탐색에 약한 조류 선호
    if (currentVel <= 0.25 || tide.mulNumber <= 3 || tide.mulNumber >= 13) {
      currentScore = 25;
    } else if (currentVel <= 0.45) {
      currentScore = 18;
    } else {
      currentScore = 10; // 채비 날림
    }
  } else {
    // MODERATE (우럭, 광어, 볼락, 무늬오징어): 0.15~0.5m/s 유속 적합
    if (currentVel >= 0.15 && currentVel <= 0.5) {
      currentScore = 24;
    } else {
      currentScore = 16;
    }
  }

  // 4. 지형 & 제철(계절) 적합도 (20점 만점)
  let spotSeasonScore = 12;
  // 지형 매칭
  if (
    (species.bottomType === 'ROCK_REEF' && (spot.spot_type === 'ROCK' || spot.spot_type === 'SEAWALL' || spot.spot_type === 'BREAKWATER')) ||
    (species.bottomType === 'SAND_FLAT' && spot.spot_type === 'BEACH') ||
    (species.bottomType === 'MUD_FLAT' && spot.spot_type === 'PIER') ||
    species.bottomType === 'OPEN_WATER'
  ) {
    spotSeasonScore += 4;
  }

  // 제철 월 매칭
  if (species.peakMonths.includes(currentMonth)) {
    spotSeasonScore += 4;
  }

  let score = Math.min(100, Math.round(tempScore + timeScore + currentScore + spotSeasonScore));
  if (isStrictlyInactiveTime) {
    // 낮 전용 어종의 야간(보리멸, 벵에돔 등) 또는 야간 전용 어종의 주간(노랑가오리, 붕장어 등) 생태적 입질 불가 반영
    score = Math.min(score, 15);
  }

  let verdict = '';
  if (score >= 85) verdict = `${species.name} 대박 찬스! ${activityMatch}, ${tempMatch}`;
  else if (score >= 70) verdict = `${species.name} 조황 기대. ${activityMatch}`;
  else if (score >= 50) verdict = `${species.name} 무난한 편이나 타이밍 조율 필요`;
  else verdict = `${species.name} 비활성 구간 (${activityMatch})`;

  return {
    speciesName: species.name,
    score,
    verdict,
    activityMatch,
    tempMatch,
  };
}

/**
 * ExFish 어종 생태 기반 맞춤형 입질 종합 지수 (Bite Index, 100점 만점)
 * - 관심 대상어(favoriteSpecies)가 주어지면 해당 어종들의 생태 데이터를 기반으로 점수 산출
 */
export function calculateBiteScore(
  spot: FishingSpot,
  weather: WeatherData,
  marine: MarineData,
  tide: TideDayInfo,
  favoriteSpecies?: string[]
): BiteScoreBreakdown {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMonth = now.getMonth() + 1; // 1~12

  // 1. 바람 및 너울 안전 판정 (캐스팅 각도와 바람 진행 방향의 물리적 일치도 연산)
  const speed = weather.windSpeed;
  let windScore = 25;
  if (speed <= 4.0) windScore = 25;
  else if (speed <= 6.5) windScore = 20;
  else if (speed <= 8.5) windScore = 13;
  else windScore = 5;

  let windRelation: BiteScoreBreakdown['windRelation'] = '등바람 (최적)';
  const CASTING_DEG: Record<string, number> = {
    N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315
  };

  let bearing: number | null = null;
  if (spot.casting_start_deg !== undefined && spot.casting_end_deg !== undefined) {
    const span = spot.casting_end_deg >= spot.casting_start_deg
      ? spot.casting_end_deg - spot.casting_start_deg
      : 360 - spot.casting_start_deg + spot.casting_end_deg;
    bearing = (spot.casting_start_deg + span / 2) % 360;
  } else {
    const primaryCastingDir = spot.casting_directions?.find((d) => d !== 'ALL');
    if (primaryCastingDir && CASTING_DEG[primaryCastingDir] !== undefined) {
      bearing = CASTING_DEG[primaryCastingDir];
    }
  }

  if (bearing !== null) {
    // 바람이 불어가는 방향 (windDirection은 불어오는 방향이므로 180도 반대)
    const windVectorDeg = (weather.windDirection + 180) % 360;
    const diff = Math.abs(bearing - windVectorDeg) % 360;
    const angleDiff = diff > 180 ? 360 - diff : diff;

    if (angleDiff <= 45 && speed <= 7.0 && marine.waveHeight <= 1.5) {
      windRelation = '등바람 (최적)';
    } else if (angleDiff >= 135 || speed > 7.5 || marine.waveHeight > 1.5) {
      windRelation = '맞바람/너울 (위험)';
      windScore = Math.max(5, windScore - 6);
    } else {
      windRelation = '옆바람 (주의)';
    }
  } else {
    if (speed > 7.0 || marine.waveHeight > 1.5) {
      windRelation = '맞바람/너울 (위험)';
      windScore = Math.max(5, windScore - 6);
    } else if (speed > 4.5) {
      windRelation = '옆바람 (주의)';
    } else {
      windRelation = '등바람 (최적)';
    }
  }

  // 2. 평가 대상 어종 목록 결정
  // (포인트에 실제 등록된 대상어종을 기준으로 하되, 사용자의 관심어종과 일치하는 어종만 선별 평가)
  const spotActualSpecies = (spot.target_species && spot.target_species.length > 0)
    ? spot.target_species
    : ['우럭', '광어'];

  let targetNames: string[] = [];
  let isCustom = false;

  if (favoriteSpecies && favoriteSpecies.length > 0) {
    // 사용자의 관심 어종 중 "해당 포인트에 실제로 서식하는 어종"만 교집합 필터링!
    const matchedFavorites = spotActualSpecies.filter((sp) =>
      favoriteSpecies.some((fav) => fav.includes(sp) || sp.includes(fav))
    );

    if (matchedFavorites.length > 0) {
      targetNames = matchedFavorites;
      isCustom = true;
    } else {
      // 내 관심어종이 해당 포인트에 전혀 서식하지 않는 경우:
      // 관심어종을 억지로 추천하지 않고, 포인트 고유 대상어종만 정상 평가!
      targetNames = spotActualSpecies;
      isCustom = false;
    }
  } else {
    targetNames = spotActualSpecies;
  }

  // 어종별 개별 점수 산출
  const speciesScores: SpeciesBiteScore[] = targetNames.map((name) => {
    // 백과사전에서 정확한 생태 매칭 또는 부분 일치 검색
    const matchedEcology =
      SPECIES_ENCYCLOPEDIA[name] ||
      Object.values(SPECIES_ENCYCLOPEDIA).find((sp) => sp.name.includes(name) || name.includes(sp.name)) ||
      SPECIES_ENCYCLOPEDIA['우럭'];

    return calculateSingleSpeciesScore(matchedEcology, spot, weather, marine, tide, currentHour, currentMonth);
  });

  // 점수 높은 순 정렬
  speciesScores.sort((a, b) => b.score - a.score);
  const topSpecies = speciesScores[0];

  // 종합 점수: 관심 어종들의 평균 점수 (최대 100점)
  const avgSpeciesScore = Math.round(
    speciesScores.reduce((acc, curr) => acc + curr.score, 0) / speciesScores.length
  );

  // 풍속/너울 안전 감점 반영
  let totalScore = avgSpeciesScore;
  if (speed > 7.5 || marine.waveHeight > 1.6) {
    totalScore = Math.max(30, totalScore - 15);
  } else if (speed > 5.5) {
    totalScore = Math.max(40, totalScore - 7);
  }

  // 브리핑 평결 생성
  let verdict = '';
  const targetLabel = isCustom
    ? `내 관심어종 [${targetNames.slice(0, 2).join(', ')}${targetNames.length > 2 ? ` 외 ${targetNames.length - 2}` : ''}]`
    : `포인트 대상어 [${targetNames.slice(0, 2).join(', ')}]`;

  if (topSpecies && topSpecies.score >= 80) {
    verdict = `🔥 현재 [${topSpecies.speciesName}] 입질 확률 최고 (${topSpecies.score}점)! ${topSpecies.activityMatch}`;
  } else if (totalScore >= 70) {
    verdict = `✨ 양호한 출조 여건 (${totalScore}점). ${topSpecies ? `${topSpecies.speciesName} 위주 공략 추천` : '물때와 수온이 안정적입니다.'}`;
  } else if (totalScore >= 50) {
    verdict = `⚖️ 무난한 여건 (${totalScore}점). ${topSpecies ? `${topSpecies.speciesName} 입질 타이밍을 노려보세요.` : '중들물 시간대 집중 요망'}`;
  } else {
    verdict = `⚠️ 까다로운 여건 (${totalScore}점). ${topSpecies ? `${topSpecies.speciesName} 활동 시간대 확인 필요.` : '바람/수온에 유의하세요.'}`;
  }

  return {
    totalScore,
    mulScore: Math.round(avgSpeciesScore * 0.3),
    windScore,
    tempScore: Math.round(avgSpeciesScore * 0.3),
    timeScore: Math.round(avgSpeciesScore * 0.25),
    windRelation,
    verdict,
    topSpecies,
    speciesScores,
    targetSummaryLabel: targetLabel,
  };
}
