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
  { name: '강릉(안인진)', lat: 37.736, lng: 128.986, meanRange: 20, highLagHours: 1.8 },
  { name: '동해(묵호)', lat: 37.551, lng: 129.117, meanRange: 20, highLagHours: 1.8 },
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

/** 양력 기준 달의 일령(Moon Age) 및 음력 일수 계산 (한국 표준시 정밀 천문 역법 기준) */
export function getMoonAge(date: Date): number {
  // 기준 신월(New Moon / 합삭): 2026년 10월 11일 00:50:00 KST (한국천문연구원 공식 합삭 시각)
  const synodicMonth = 29.530588853; // 정밀 삭망월 주기(일)
  const baseTime = new Date('2026-10-11T00:50:00+09:00').getTime();

  // 한국 표준시(KST) 정오(12:00) 기준 일수로 계산하여 날짜 경계 오차 원천 차단
  const kstTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0).getTime();
  const diffDays = (kstTarget - baseTime) / (1000 * 60 * 60 * 24);
  const moonAge = ((diffDays % synodicMonth) + synodicMonth) % synodicMonth;
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

  // 3일간 요약 데이터 산출 (오늘, 내일, 모레 - 정오 12시 기준으로 SunCalc 계산하여 표준시 왜곡 방지)
  for (let d = 0; d < 3; d++) {
    const curDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + d, 12, 0, 0);
    const moonAge = getMoonAge(curDate);
    const { mulText, mulNumber } = getMulInfo(moonAge);
    const times = SunCalc.getTimes(curDate, lat, lng);

    const firstHighHour = (harbor.highLagHours + moonAge * 0.83) % tideCycle;
    const springFactor = 0.4 + 0.6 * (Math.sin(((mulNumber - 1) / 15) * Math.PI) ** 2);
    const amplitude = (harbor.meanRange * springFactor) / 2;
    // 동해안(조차 50cm 이하 소조차 해역)은 기준 해수면 16cm 기준, 서·남해안은 조차 비례 계산
    const meanSeaLevel = harbor.meanRange <= 50 ? 16 : harbor.meanRange * 0.6;

    const highs: { time: string; height: number }[] = [];
    const lows: { time: string; height: number }[] = [];

    // 일조부등(Diurnal Inequality): 태음일주조(O1)와 일월일주조(K1)에 의한 일중 고조·저조 조위차
    const diurnalFactor = 0.22 * Math.sin(((moonAge - 3) / 14.76) * Math.PI);
    const diurnalDiff = Math.round(amplitude * diurnalFactor);

    // 당일 00:00~23:59 사이에 발생하는 모든 만조 시각 산출 (반일주조 12.42시간 간격 + 일조부등 반영)
    const highHours: number[] = [];
    for (let k = -1; k <= 2; k++) {
      const hr = firstHighHour + k * tideCycle;
      if (hr >= 0 && hr < 24) {
        highHours.push(hr);
      }
    }
    highHours.sort((a, b) => a - b).forEach((hr, idx) => {
      const h = Math.floor(hr);
      const m = Math.floor((hr - h) * 60);
      const ineq = idx % 2 === 0 ? diurnalDiff : -diurnalDiff;
      highs.push({
        time: `${padZero(h)}:${padZero(m)}`,
        height: Math.max(10, Math.round(meanSeaLevel + amplitude + ineq)),
      });
    });

    // 당일 00:00~23:59 사이에 발생하는 모든 간조 시각 산출 (만조 대비 6.21시간 위상차 + 일조부등 반영)
    const lowHours: number[] = [];
    for (let k = -2; k <= 2; k++) {
      const hr = firstHighHour + (k + 0.5) * tideCycle;
      if (hr >= 0 && hr < 24) {
        lowHours.push(hr);
      }
    }
    lowHours.sort((a, b) => a - b).forEach((hr, idx) => {
      const h = Math.floor(hr);
      const m = Math.floor((hr - h) * 60);
      const ineq = idx % 2 === 0 ? -diurnalDiff * 0.8 : diurnalDiff * 0.8;
      lows.push({
        time: `${padZero(h)}:${padZero(m)}`,
        height: Math.max(2, Math.round(meanSeaLevel - amplitude + ineq)),
      });
    });

    const dayName = `${padZero(curDate.getMonth() + 1)}/${padZero(curDate.getDate())} (${['일', '월', '화', '수', '목', '금', '토'][curDate.getDay()]})`;

    threeDays.push({
      dateStr: dayName,
      dayLabel: dayLabels[d],
      mulText,
      sunrise: formatTime(times.sunrise),
      sunset: formatTime(times.sunset),
      highTides: highs,
      lowTides: lows,
    });
  }

  // 1. 미래 황금 피딩 타임(Golden Feeding Times) 사전 계산 (오늘/내일 정확한 날짜 기준)
  const allFeedingTimes: {
    label: string;
    timeRange: string;
    reason: string;
    startHour: number;
    endHour: number;
    startTimeStr: string;
    endTimeStr: string;
    startTimestamp: number;
    endTimestamp: number;
    dayLabel: string;
    startDisplayTime?: string;
    endDisplayTime?: string;
  }[] = [];

  for (let d = 0; d < 3; d++) {
    // 12시 기준으로 날짜 객체를 생성하여 자정/표준시 왜곡 원천 차단
    const dayDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + d, 12, 0, 0);
    const dayTimes = SunCalc.getTimes(dayDate, lat, lng);
    const daySummary = threeDays[d];
    const prefix = d === 0 ? '오늘' : d === 1 ? '내일' : '모레';

    // (1) 아침 해창 피딩 (일출 전 40분 ~ 일출 후 60분)
    if (dayTimes.sunrise && !isNaN(dayTimes.sunrise.getTime())) {
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
        startTimestamp: srStart.getTime(),
        endTimestamp: srEnd.getTime(),
        dayLabel: prefix,
      });
    }

    // (2) 들물 본류대 피딩 (각 만조 2시간 전 ~ 만조 시점)
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
          startTimestamp: htStartDate.getTime(),
          endTimestamp: htDate.getTime(),
          dayLabel: prefix,
        });
      });
    }

    // (3) 저녁 해질녘 피딩 (일몰 전 60분 ~ 일몰 후 40분)
    if (dayTimes.sunset && !isNaN(dayTimes.sunset.getTime())) {
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
        startTimestamp: ssStart.getTime(),
        endTimestamp: ssEnd.getTime(),
        dayLabel: prefix,
      });
    }
  }

  // 2. 현재 시각 -6시간 ~ 향후 +36시간 실시간 연속 조위 곡선 (총 42시간, 황금 피딩 타임 구간 태깅)
  const curve36: TideCurvePoint[] = [];
  const baseTimestamp = baseDate.getTime();

  for (let offset = -6; offset <= 36; offset++) {
    const pointDate = new Date(baseTimestamp + offset * 3600 * 1000);
    const moonAge = getMoonAge(pointDate);
    const { mulNumber } = getMulInfo(moonAge);

    const firstHighHour = (harbor.highLagHours + moonAge * 0.83) % tideCycle;
    const springFactor = 0.4 + 0.6 * (Math.sin(((mulNumber - 1) / 15) * Math.PI) ** 2);
    const amplitude = (harbor.meanRange * springFactor) / 2;
    // 동해안(조차 50cm 이하 소조차 해역)은 기준 해수면 16cm 기준, 서·남해안은 조차 비례 계산
    const meanSeaLevel = harbor.meanRange <= 50 ? 16 : harbor.meanRange * 0.6;

    const t = pointDate.getHours() + pointDate.getMinutes() / 60;
    const phase = ((t - firstHighHour) * 2 * Math.PI) / tideCycle;
    const diurnalFactor = 0.22 * Math.sin(((moonAge - 3) / 14.76) * Math.PI);
    const diurnalDiff = Math.round(amplitude * diurnalFactor);
    const phaseDiurnal = ((t - (firstHighHour + 3)) * Math.PI) / 12;
    const height = Math.max(2, Math.round(meanSeaLevel + amplitude * Math.cos(phase) + diurnalDiff * Math.cos(phaseDiurnal)));

    const slope = -Math.sin(phase);
    let stateText = '물돌이(정조)';
    if (slope > 0.3) stateText = '들물';
    else if (slope < -0.3) stateText = '날물';

    const dayDiff = Math.floor((pointDate.getTime() - startOfDay.getTime()) / (24 * 3600 * 1000));
    const dayLabel = dayDiff === 0 ? '오늘' : dayDiff === 1 ? '내일' : dayDiff === -1 ? '어제' : '모레';

    // 해당 날짜의 일출/일몰 시각 확인 (오차 35분 이내)
    const pTimes = SunCalc.getTimes(new Date(pointDate.getFullYear(), pointDate.getMonth(), pointDate.getDate(), 12, 0, 0), lat, lng);
    const isSunrise = pTimes.sunrise ? Math.abs(pointDate.getTime() - pTimes.sunrise.getTime()) <= 35 * 60000 : false;
    const isSunset = pTimes.sunset ? Math.abs(pointDate.getTime() - pTimes.sunset.getTime()) <= 35 * 60000 : false;

    // 만조/간조 정점 확인: cos(phase) > 0.95 (만조), cos(phase) < -0.95 (간조)
    const cosVal = Math.cos(phase);
    const isHighTide = cosVal >= 0.96;
    const isLowTide = cosVal <= -0.96;
    const tideDiff = Math.round(amplitude * 2); // 조차 (만조-간조차 cm)

    // [요구사항 2] 황금 피딩 타임 구간 매칭 확인
    const matchedFeeding = allFeedingTimes.find(
      (f) => pointDate.getTime() >= f.startTimestamp && pointDate.getTime() <= f.endTimestamp
    );
    const isFeedingTime = Boolean(matchedFeeding);
    const feedingReason = matchedFeeding?.reason;
    const feedingLabel = matchedFeeding?.label;

    let eventLabel = '';
    if (offset === 0) eventLabel = `현재 (${height}cm)`;
    else if (isHighTide) eventLabel = `만조 ${height}cm (조차 ${tideDiff}cm)`;
    else if (isLowTide) eventLabel = `간조 ${height}cm (조차 ${tideDiff}cm)`;
    else if (isSunrise) eventLabel = `일출 ${formatTime(pTimes.sunrise)}`;
    else if (isSunset) eventLabel = `일몰 ${formatTime(pTimes.sunset)}`;
    else if (isFeedingTime && feedingLabel) eventLabel = `✨ ${feedingLabel}`;

    const displayTime = `${dayLabel !== '오늘' ? `${dayLabel} ` : ''}${padZero(pointDate.getHours())}:00`;

    curve36.push({
      hour: offset,
      timeStr: `${padZero(pointDate.getHours())}:00`,
      displayTime,
      dateStr: `${padZero(pointDate.getMonth() + 1)}/${padZero(pointDate.getDate())}`,
      dayLabel,
      height,
      stateText,
      isCurrent: offset === 0,
      isSunrise,
      isSunset,
      isHighTide,
      isLowTide,
      isFeedingTime,
      feedingReason,
      feedingLabel,
      tideDiff,
      eventLabel: eventLabel || undefined,
    });
  }

  // [요구사항 5] 직전 극값(만조 또는 간조) 기준 조위 변화량(tideDiff) 정밀 재계산
  // 만조: 이전 간조에서 더해지는 값 (+), 간조: 이전 만조에서 차감되는 값 (-), 사이 값도 직전 극값 기준 증감
  let lastExtremum: { type: 'HIGH' | 'LOW'; height: number } | null = null;
  const baseMulNumber = getMulInfo(getMoonAge(baseDate)).mulNumber;
  const approxRange = harbor.meanRange * (0.4 + 0.6 * (Math.sin(((baseMulNumber - 1) / 15) * Math.PI) ** 2));
  const meanLevel = harbor.meanRange * 0.6;
  if (curve36.length >= 2) {
    const isRising = curve36[1].height >= curve36[0].height;
    if (isRising) {
      lastExtremum = { type: 'LOW', height: Math.max(10, Math.round(meanLevel - approxRange / 2)) };
    } else {
      lastExtremum = { type: 'HIGH', height: Math.round(meanLevel + approxRange / 2) };
    }
  }

  for (let i = 0; i < curve36.length; i++) {
    const pt = curve36[i];
    const prevPt = curve36[i - 1];
    const nextPt = curve36[i + 1];

    const isPeakHigh = (prevPt ? pt.height >= prevPt.height : false) && (nextPt ? pt.height >= nextPt.height : false) && pt.height > meanLevel;
    const isPeakLow = (prevPt ? pt.height <= prevPt.height : false) && (nextPt ? pt.height <= nextPt.height : false) && pt.height < meanLevel;

    if (isPeakHigh) {
      const diff = lastExtremum ? pt.height - lastExtremum.height : Math.round(approxRange);
      pt.tideDiff = Math.abs(diff);
      lastExtremum = { type: 'HIGH', height: pt.height };
    } else if (isPeakLow) {
      const diff = lastExtremum ? pt.height - lastExtremum.height : -Math.round(approxRange);
      pt.tideDiff = diff < 0 ? diff : -diff;
      lastExtremum = { type: 'LOW', height: pt.height };
    } else if (lastExtremum) {
      pt.tideDiff = pt.height - lastExtremum.height;
    }
  }

  // 3. 피딩 타임에 curve36의 시작/종료 displayTime 매핑 (차트 ReferenceArea 렌더링용)
  for (const f of allFeedingTimes) {
    const startPt = curve36.find((c) => Math.abs(c.hour * 3600000 + baseTimestamp - f.startTimestamp) <= 45 * 60000) ||
      curve36.find((c) => c.hour * 3600000 + baseTimestamp >= f.startTimestamp);
    const endPt = curve36.slice().reverse().find((c) => Math.abs(c.hour * 3600000 + baseTimestamp - f.endTimestamp) <= 45 * 60000) ||
      curve36.slice().reverse().find((c) => c.hour * 3600000 + baseTimestamp <= f.endTimestamp);

    if (startPt && endPt) {
      f.startDisplayTime = startPt.displayTime;
      f.endDisplayTime = endPt.displayTime;
    }
  }

  // 72시간 연속 시간별 조위 곡선 (기존 하위 호환 유지)
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
    // 동해안(조차 50cm 이하 소조차 해역)은 기준 해수면 16cm 기준, 서·남해안은 조차 비례 계산
    const meanSeaLevel = harbor.meanRange <= 50 ? 16 : harbor.meanRange * 0.6;

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
  const todayTimes = SunCalc.getTimes(new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 12, 0, 0), lat, lng);

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
    curve36,
    threeDays,
    sunrise: formatTime(todayTimes.sunrise),
    sunset: formatTime(todayTimes.sunset),
    dawn: formatTime(todayTimes.dawn),
    dusk: formatTime(todayTimes.dusk),
    feedingTimes,
  };
}
