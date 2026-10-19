import * as SunCalc from 'suncalc';
import type { TideDayInfo } from '../types';

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
  // 음력 1일 = 7물(사리), 2일 = 8물 ... 8일 = 14물(조금), 9일 = 15물(무시), 10일 = 1물 ... 15일 = 6물, 16일 = 7물
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

/** 특정 날짜, 포인트 좌표에 대한 물때, 일출일몰 및 24시간 조석 곡선 계산 */
export function calculateTideDay(lat: number, lng: number, date: Date = new Date()): TideDayInfo {
  const harbor = findNearestHarbor(lat, lng);
  const moonAge = getMoonAge(date);
  const { mulNumber, mulText, lunarDay } = getMulInfo(moonAge);

  // SunCalc를 이용한 일출, 일몰, 박명 시각
  const times = SunCalc.getTimes(date, lat, lng);
  const formatTime = (d: Date | null | undefined) => (!d || isNaN(d.getTime())) ? '--:--' : `${padZero(d.getHours())}:${padZero(d.getMinutes())}`;

  // 조석 계산 (하루 약 2회 만조, 2회 간조. 평균 주기 12시간 25분 = 12.42시간)
  // 매일 만조는 전날보다 약 50분(0.83시간)씩 늦어짐
  const tideCycle = 12.42;
  const firstHighHour = (harbor.highLagHours + (moonAge * 0.83)) % tideCycle;
  
  // 물때별 조차 크기 (사리 때 최대, 조금 때 최소)
  // mulNumber 7~8일 때 factor ~ 1.0, 14~15일 때 factor ~ 0.4
  const springFactor = 0.4 + 0.6 * (Math.sin(((mulNumber - 1) / 15) * Math.PI) ** 2);
  const amplitude = (harbor.meanRange * springFactor) / 2;
  const meanSeaLevel = harbor.meanRange * 0.6; // 기준 수위

  const hourlyCurve: TideDayInfo['hourlyCurve'] = [];
  const highTides: { time: string; height: number }[] = [];
  const lowTides: { time: string; height: number }[] = [];

  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const t = h + m / 60;
      // cos 곡선 기반 조위 계산
      const phase = ((t - firstHighHour) * 2 * Math.PI) / tideCycle;
      const height = Math.round(meanSeaLevel + amplitude * Math.cos(phase));
      
      // 조석 상태 텍스트 판정 (들물 vs 썰물)
      // phase 도함수: -sin(phase) > 0 이면 들물(상승), < 0 이면 썰물(하강)
      const slope = -Math.sin(phase);
      let stateText = '물돌이(정조)';
      if (slope > 0.3) stateText = '들물(밀물)';
      else if (slope < -0.3) stateText = '썰물(날물)';

      if (m === 0) {
        hourlyCurve.push({
          hour: h,
          timeStr: `${padZero(h)}:00`,
          height,
          stateText,
        });
      }
    }
  }

  // 4대 만·간조 시각 산출 (대략 2회 고조, 2회 저조)
  const highs = [firstHighHour, (firstHighHour + tideCycle) % 24, (firstHighHour + tideCycle * 2) % 24];
  const lows = [
    (firstHighHour + tideCycle / 2) % 24,
    (firstHighHour + tideCycle * 1.5) % 24,
    (firstHighHour + tideCycle * 2.5) % 24,
  ];

  highs.sort((a, b) => a - b).forEach((hr) => {
    if (hr >= 0 && hr < 24) {
      const h = Math.floor(hr);
      const m = Math.floor((hr - h) * 60);
      highTides.push({
        time: `${padZero(h)}:${padZero(m)}`,
        height: Math.round(meanSeaLevel + amplitude),
      });
    }
  });

  lows.sort((a, b) => a - b).forEach((hr) => {
    if (hr >= 0 && hr < 24) {
      const h = Math.floor(hr);
      const m = Math.floor((hr - h) * 60);
      lowTides.push({
        time: `${padZero(h)}:${padZero(m)}`,
        height: Math.max(10, Math.round(meanSeaLevel - amplitude)),
      });
    }
  });

  return {
    lunarDateStr: `음력 ${lunarDay}일`,
    mulText,
    mulNumber,
    highTides: highTides.slice(0, 2),
    lowTides: lowTides.slice(0, 2),
    hourlyCurve,
    sunrise: formatTime(times.sunrise),
    sunset: formatTime(times.sunset),
    dawn: formatTime(times.dawn),
    dusk: formatTime(times.dusk),
  };
}
