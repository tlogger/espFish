import * as SunCalc from 'suncalc';
import type { TideCurvePoint, TideDayInfo, TideDaySummary } from '../types';

// 한국 연안 주요 표준항 좌표 및 대략적 조차(Harmonic Constant M2, S2 근사치)
export interface HarborRef {
  name: string;
  lat: number;
  lng: number;
  meanRange: number; // 평균 조차 cm (서해: ~800, 남해: ~300, 동해: ~30)
  highLagHours: number; // 음력 합삭 기준 평균 만조 지각(시간)
}

export const KOREA_HARBORS: HarborRef[] = [
  { name: '인천', lat: 37.452, lng: 126.592, meanRange: 750, highLagHours: 4.8 },
  { name: '평택', lat: 36.993, lng: 126.834, meanRange: 820, highLagHours: 5.1 },
  { name: '안흥(태안)', lat: 36.678, lng: 126.132, meanRange: 600, highLagHours: 3.5 },
  { name: '보령(대천)', lat: 36.327, lng: 126.512, meanRange: 580, highLagHours: 3.2 },
  { name: '군산', lat: 35.976, lng: 126.554, meanRange: 550, highLagHours: 3.0 },
  { name: '목포', lat: 34.779, lng: 126.376, meanRange: 420, highLagHours: 2.2 },
  { name: '완도', lat: 34.316, lng: 126.757, meanRange: 320, highLagHours: 10.5 },
  { name: '여수', lat: 34.747, lng: 127.768, meanRange: 280, highLagHours: 9.2 },
  { name: '통영', lat: 34.829, lng: 128.423, meanRange: 220, highLagHours: 8.7 },
  { name: '부산', lat: 35.096, lng: 129.038, meanRange: 130, highLagHours: 7.5 },
  { name: '울산', lat: 35.503, lng: 129.382, meanRange: 50, highLagHours: 6.8 },
  { name: '포항', lat: 36.048, lng: 129.383, meanRange: 25, highLagHours: 5.2 },
  { name: '속초', lat: 38.204, lng: 128.601, meanRange: 20, highLagHours: 4.0 },
  { name: '제주', lat: 33.528, lng: 126.543, meanRange: 230, highLagHours: 10.8 },
  { name: '서귀포', lat: 33.241, lng: 126.564, meanRange: 220, highLagHours: 10.1 },
];

/** 하버사인 거리(km) 계산 */
export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** 위경도에서 가장 가까운 표준항 찾기 */
export function findNearestHarbor(lat: number, lng: number): HarborRef {
  let nearest = KOREA_HARBORS[0];
  let minDistance = Infinity;

  for (const harbor of KOREA_HARBORS) {
    const dist = getDistanceKm(lat, lng, harbor.lat, harbor.lng);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = harbor;
    }
  }
  return nearest;
}

/** 양력 기준 달의 일령(Moon Age) 및 음력 일수 계산 (정밀 근사치) */
export function getMoonAge(date: Date): number {
  // 기준 신월(New Moon): 2000년 1월 6일 18:14 UTC
  const synodicMonth = 29.53058867; // 삭망월 주기(일)
  const baseTime = new Date(Date.UTC(2000, 0, 6, 18, 14, 0)).getTime();
  const diffDays = (date.getTime() - baseTime) / (1000 * 60 * 60 * 24);
  const moonAge = (diffDays % synodicMonth + synodicMonth) % synodicMonth;
  return moonAge;
}

/** 8물제 기준 물때 명칭 계산 (한국 바다낚시 표준) */
export function getMulInfo(moonAge: number): { mulNumber: number; mulText: string; lunarDay: number } {
  const lunarDay = Math.floor(moonAge) + 1; // 음력 1일 ~ 30일
  
  // 8물제 (사리 = 7~8물, 조금 = 14물, 무시 = 15물)
  let mulNum = (lunarDay + 6) % 15;
  if (mulNum === 0) mulNum = 15;

  let mulText = `${mulNum}물`;
  if (mulNum === 7 || mulNum === 8) mulText += ' (사리)';
  else if (mulNum === 14) mulText += ' (조금)';
  else if (mulNum === 15) mulText += ' (무시)';

  return { mulNumber: mulNum, mulText, lunarDay };
}

/** 2자리 숫자 포맷 */
function padZero(num: number): string {
  return num < 10 ? `0${num}` : `${num}`;
}

/** 특정 날짜, 포인트 좌표에 대한 물때, 일출일몰 및 72시간 연속 조석 곡선 계산 (오늘 0시 기준 3일간) */
export function calculateTideDay(lat: number, lng: number, baseDate: Date = new Date()): TideDayInfo {
  const harbor = findNearestHarbor(lat, lng);
  const tideCycle = 12.42;

  const formatTime = (d: Date | null | undefined) =>
    !d || isNaN(d.getTime()) ? '--:--' : `${padZero(d.getHours())}:${padZero(d.getMinutes())}`;

  // 오늘 00:00:00 기준 시점
  const startOfDay = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 0, 0, 0);

  const dayLabels = ['오늘', '내일', '모레'];
  const threeDays: TideDaySummary[] = [];

  // 3일간 요약 데이터 산출 (오늘, 내일, 모레)
  for (let d = 0; d < 3; d++) {
    const curDate = new Date(startOfDay.getTime() + d * 24 * 3600 * 1000);
    const moonAge = getMoonAge(curDate);
    const { mulText, mulNumber } = getMulInfo(moonAge);
    const times = SunCalc.getTimes(curDate, lat, lng);

    const firstHighHour = (harbor.highLagHours + moonAge * 0.83) % tideCycle;
    const springFactor = 0.4 + 0.6 * (Math.sin(((mulNumber - 1) / 15) * Math.PI) ** 2);
    const amplitude = (harbor.meanRange * springFactor) / 2;
    const meanSeaLevel = harbor.meanRange * 0.6;

    const highs: { time: string; height: number }[] = [];
    const lows: { time: string; height: number }[] = [];

    const highCandidates = [firstHighHour, (firstHighHour + tideCycle) % 24, (firstHighHour + tideCycle * 2) % 24];
    const lowCandidates = [
      (firstHighHour + tideCycle / 2) % 24,
      (firstHighHour + tideCycle * 1.5) % 24,
      (firstHighHour + tideCycle * 2.5) % 24,
    ];

    highCandidates.sort((a, b) => a - b).forEach((hr) => {
      if (hr >= 0 && hr < 24) {
        const h = Math.floor(hr);
        const m = Math.floor((hr - h) * 60);
        highs.push({
          time: `${padZero(h)}:${padZero(m)}`,
          height: Math.round(meanSeaLevel + amplitude),
        });
      }
    });

    lowCandidates.sort((a, b) => a - b).forEach((hr) => {
      if (hr >= 0 && hr < 24) {
        const h = Math.floor(hr);
        const m = Math.floor((hr - h) * 60);
        lows.push({
          time: `${padZero(h)}:${padZero(m)}`,
          height: Math.max(10, Math.round(meanSeaLevel - amplitude)),
        });
      }
    });

    const dayName = `${padZero(curDate.getMonth() + 1)}/${padZero(curDate.getDate())} (${['일', '월', '화', '수', '목', '금', '토'][curDate.getDay()]})`;

    threeDays.push({
      dateStr: dayName,
      dayLabel: dayLabels[d],
      mulText,
      sunrise: formatTime(times.sunrise),
      sunset: formatTime(times.sunset),
      highTides: highs.slice(0, 2),
      lowTides: lows.slice(0, 2),
    });
  }

  // 72시간 연속 시간별 조위 곡선 (0h ~ 71h)
  const hourly72Curve: TideCurvePoint[] = [];
  const hourlyCurve: TideCurvePoint[] = [];

  for (let totalHour = 0; totalHour < 72; totalHour++) {
    const curHourDate = new Date(startOfDay.getTime() + totalHour * 3600 * 1000);
    const dayIdx = Math.floor(totalHour / 24);
    const moonAge = getMoonAge(curHourDate);
    const { mulNumber } = getMulInfo(moonAge);

    const firstHighHour = (harbor.highLagHours + moonAge * 0.83) % tideCycle;
    const springFactor = 0.4 + 0.6 * (Math.sin(((mulNumber - 1) / 15) * Math.PI) ** 2);
    const amplitude = (harbor.meanRange * springFactor) / 2;
    const meanSeaLevel = harbor.meanRange * 0.6;

    // 현재 시각 기준 phase
    const t = curHourDate.getHours();
    const phase = ((t - firstHighHour) * 2 * Math.PI) / tideCycle;
    const height = Math.round(meanSeaLevel + amplitude * Math.cos(phase));

    const slope = -Math.sin(phase);
    let stateText = '물돌이(정조)';
    if (slope > 0.3) stateText = '들물';
    else if (slope < -0.3) stateText = '날물';

    const point: TideCurvePoint = {
      hour: totalHour,
      timeStr: `${padZero(curHourDate.getMonth() + 1)}/${padZero(curHourDate.getDate())} ${padZero(t)}:00`,
      dateStr: `${padZero(curHourDate.getMonth() + 1)}/${padZero(curHourDate.getDate())}`,
      dayLabel: dayLabels[dayIdx] || '예보',
      height,
      stateText,
    };

    hourly72Curve.push(point);

    if (totalHour < 24) {
      hourlyCurve.push({
        hour: totalHour,
        timeStr: `${padZero(t)}:00`,
        dateStr: point.dateStr,
        dayLabel: '오늘',
        height,
        stateText,
      });
    }
  }

  // 오늘 기준 대표 정보
  const todayMoonAge = getMoonAge(baseDate);
  const todayMul = getMulInfo(todayMoonAge);
  const todayTimes = SunCalc.getTimes(baseDate, lat, lng);

  // 미래 황금 피딩 타임(Golden Feeding Times) 계산 (현재 시각 이후의 피딩 타임만 추출)
  // 오늘뿐만 아니라 오늘 밤, 내일, 모레까지 3일간 계산하여 현재 시각 이후의 미래 피딩 타임들을 순서대로 제공
  const allFeedingTimes: {
    label: string;
    timeRange: string;
    reason: string;
    startHour: number;
    endHour: number;
    startTimeStr: string;
    endTimeStr: string;
    endTimestamp: number;
    dayLabel: string;
  }[] = [];

  for (let d = 0; d < 3; d++) {
    const dayDate = new Date(startOfDay.getTime() + d * 24 * 3600 * 1000);
    const dayTimes = SunCalc.getTimes(dayDate, lat, lng);
    const daySummary = threeDays[d];
    const prefix = d === 0 ? '오늘' : d === 1 ? '내일' : '모레';

    // 1. 아침 해창 피딩 (일출 전 40분 ~ 일출 후 60분)
    if (dayTimes.sunrise) {
      const srStart = new Date(dayTimes.sunrise.getTime() - 40 * 60000);
      const srEnd = new Date(dayTimes.sunrise.getTime() + 60 * 60000);
      const sHour = srStart.getHours() + d * 24;
      const eHour = srEnd.getHours() + d * 24;
      const sTimeStr = `${padZero(srStart.getMonth() + 1)}/${padZero(srStart.getDate())} ${padZero(srStart.getHours())}:00`;
      const eTimeStr = `${padZero(srEnd.getMonth() + 1)}/${padZero(srEnd.getDate())} ${padZero(srEnd.getHours())}:00`;

      allFeedingTimes.push({
        label: `🌅 ${prefix} 아침 해창`,
        timeRange: `${d > 0 ? `(${prefix}) ` : ''}${formatTime(srStart)} ~ ${formatTime(srEnd)}`,
        reason: '일출 전후 먹이활동 집중 (시각 어종 활성)',
        startHour: sHour,
        endHour: Math.max(eHour, sHour + 1),
        startTimeStr: sTimeStr,
        endTimeStr: eTimeStr,
        endTimestamp: srEnd.getTime(),
        dayLabel: prefix,
      });
    }

    // 2. 들물 본류대 피딩 (각 만조 2시간 전 ~ 만조 시점)
    if (daySummary && daySummary.highTides) {
      daySummary.highTides.forEach((ht, htIdx) => {
        const [hHour, hMin] = ht.time.split(':').map(Number);
        const htDate = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), hHour, hMin, 0);
        const htStartDate = new Date(htDate.getTime() - 2 * 3600 * 1000);

        const sHour = (hHour - 2 + 24) % 24 + d * 24;
        const eHour = hHour + d * 24;
        const sTimeStr = `${padZero(htStartDate.getMonth() + 1)}/${padZero(htStartDate.getDate())} ${padZero(htStartDate.getHours())}:00`;
        const eTimeStr = `${padZero(htDate.getMonth() + 1)}/${padZero(htDate.getDate())} ${padZero(htDate.getHours())}:00`;

        allFeedingTimes.push({
          label: `🌊 ${prefix} 들물 피딩${daySummary.highTides.length > 1 ? ` (${htIdx + 1}차)` : ''}`,
          timeRange: `${d > 0 ? `(${prefix}) ` : ''}${formatTime(htStartDate)} ~ ${formatTime(htDate)}`,
          reason: `만조 전 조류 유입 활성 (${ht.height}cm 만조 전)`,
          startHour: sHour,
          endHour: Math.max(eHour, sHour + 1),
          startTimeStr: sTimeStr,
          endTimeStr: eTimeStr,
          endTimestamp: htDate.getTime(),
          dayLabel: prefix,
        });
      });
    }

    // 3. 저녁 해질녘 피딩 (일몰 전 60분 ~ 일몰 후 40분)
    if (dayTimes.sunset) {
      const ssStart = new Date(dayTimes.sunset.getTime() - 60 * 60000);
      const ssEnd = new Date(dayTimes.sunset.getTime() + 40 * 60000);
      const sHour = ssStart.getHours() + d * 24;
      const eHour = ssEnd.getHours() + d * 24;
      const sTimeStr = `${padZero(ssStart.getMonth() + 1)}/${padZero(ssStart.getDate())} ${padZero(ssStart.getHours())}:00`;
      const eTimeStr = `${padZero(ssEnd.getMonth() + 1)}/${padZero(ssEnd.getDate())} ${padZero(ssEnd.getHours())}:00`;

      allFeedingTimes.push({
        label: `🌇 ${prefix} 저녁 일몰`,
        timeRange: `${d > 0 ? `(${prefix}) ` : ''}${formatTime(ssStart)} ~ ${formatTime(ssEnd)}`,
        reason: '일몰 골든아워 (포식성 어종 연안 접근)',
        startHour: sHour,
        endHour: Math.max(eHour, sHour + 1),
        startTimeStr: sTimeStr,
        endTimeStr: eTimeStr,
        endTimestamp: ssEnd.getTime(),
        dayLabel: prefix,
      });
    }
  }

  // 시간순 정렬 및 현재 시각(baseDate) 기준 종료되지 않은 미래 피딩 타임만 필터링
  const nowMs = baseDate.getTime();
  const futureFeedingTimes = allFeedingTimes
    .filter((f) => f.endTimestamp > nowMs)
    .sort((a, b) => a.endTimestamp - b.endTimestamp)
    .slice(0, 4); // 가장 가까운 다음 4개 피딩 타임 카드 제공

  // 만약 3일치 전체가 필터링되었을 경우(드문 경우)를 대비해 안전 폴백
  const feedingTimes = futureFeedingTimes.length > 0 ? futureFeedingTimes : allFeedingTimes.slice(0, 3);

  return {
    lunarDateStr: `음력 ${todayMul.lunarDay}일`,
    mulText: todayMul.mulText,
    mulNumber: todayMul.mulNumber,
    highTides: threeDays[0].highTides,
    lowTides: threeDays[0].lowTides,
    hourlyCurve,
    hourly72Curve,
    threeDays,
    sunrise: formatTime(todayTimes.sunrise),
    sunset: formatTime(todayTimes.sunset),
    dawn: formatTime(todayTimes.dawn),
    dusk: formatTime(todayTimes.dusk),
    feedingTimes,
  };
}
