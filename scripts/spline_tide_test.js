// scripts/spline_tide_test.js
// 60분 조위 데이터로부터 큐빅 스플라인 보간을 수행하여 만조/간조 극치(시간, 조위)를 도출하고
// KHOA 공식 모바일 예보치와 비교 검증하는 프로그램

// 1. 삼차 스플라인 (Natural Cubic Spline) 구현
class CubicSpline {
  constructor(xs, ys) {
    this.xs = xs;
    this.ys = ys;
    const n = xs.length;
    this.a = [...ys];
    this.b = new Array(n - 1);
    this.d = new Array(n - 1);
    this.c = new Array(n).fill(0);

    const h = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      h[i] = xs[i + 1] - xs[i];
    }

    const alpha = new Array(n - 1).fill(0);
    for (let i = 1; i < n - 1; i++) {
      alpha[i] = (3 / h[i]) * (this.a[i + 1] - this.a[i]) - (3 / h[i - 1]) * (this.a[i] - this.a[i - 1]);
    }

    const l = new Array(n).fill(0);
    const mu = new Array(n).fill(0);
    const z = new Array(n).fill(0);
    l[0] = 1;

    for (let i = 1; i < n - 1; i++) {
      l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1];
      mu[i] = h[i] / l[i];
      z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
    }

    l[n - 1] = 1;
    z[n - 1] = 0;
    this.c[n - 1] = 0;

    for (let j = n - 2; j >= 0; j--) {
      this.c[j] = z[j] - mu[j] * this.c[j + 1];
      this.b[j] = (this.a[j + 1] - this.a[j]) / h[j] - (h[j] * (this.c[j + 1] + 2 * this.c[j])) / 3;
      this.d[j] = (this.c[j + 1] - this.c[j]) / (3 * h[j]);
    }
  }

  // t(분 단위 or 시간 단위)에서의 조위 값
  evaluate(t) {
    const n = this.xs.length;
    let i = 0;
    if (t <= this.xs[0]) i = 0;
    else if (t >= this.xs[n - 1]) i = n - 2;
    else {
      let low = 0, high = n - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (this.xs[mid] <= t) {
          i = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      if (i >= n - 1) i = n - 2;
    }
    const dx = t - this.xs[i];
    return this.a[i] + this.b[i] * dx + this.c[i] * dx * dx + this.d[i] * dx * dx * dx;
  }

  // 1차 도함수 (미분 계수 f'(t))
  derivative(t) {
    const n = this.xs.length;
    let i = 0;
    if (t <= this.xs[0]) i = 0;
    else if (t >= this.xs[n - 1]) i = n - 2;
    else {
      let low = 0, high = n - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (this.xs[mid] <= t) {
          i = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      if (i >= n - 1) i = n - 2;
    }
    const dx = t - this.xs[i];
    return this.b[i] + 2 * this.c[i] * dx + 3 * this.d[i] * dx * dx;
  }
}

// 2. KHOA Open API 호출 (지정 날짜)
async function fetchDayData(obsCode, dateStr) {
  const serviceKey = '7Q54Z6DQ%2B9wH23fR%2FAlrOSh4XgQ9xyA8I%2F69h1tmrlCwtFqMG8zdR01z0h8%2Bo%2Ft1Uvt%2BwoN947y1ts5Maeoy%2Bg%3D%3D';
  const url = `https://apis.data.go.kr/1192136/surveyTideLevel/GetSurveyTideLevelApiService?serviceKey=${serviceKey}&type=json&obsCode=${obsCode}&reqDate=${dateStr}&min=60&pageNo=1&numOfRows=24`;
  const res = await fetch(url);
  const data = await res.json();
  return data.body?.items?.item || [];
}

// 3. KHOA 모바일 주간 데이터 조회 (비교 기준)
async function fetchKhoaMobileData(obsCode, dateStr) {
  const params = new URLSearchParams();
  params.append('stDate', dateStr);
  params.append('obsPostId', obsCode);
  const res = await fetch('https://www.khoa.go.kr/swtc/getWeeklyData.do', {
    method: 'POST',
    body: params,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0'
    }
  });
  const data = await res.json();
  return data.weeklyData || [];
}

// 4. 극값(만조/간조) 탐색 알고리즘
function findExtrema(spline, startTimeMin, endTimeMin, stepMin = 1) {
  const extrema = [];
  let prevVal = spline.evaluate(startTimeMin);
  let prevDiff = spline.derivative(startTimeMin);

  for (let t = startTimeMin + stepMin; t <= endTimeMin; t += stepMin) {
    const curVal = spline.evaluate(t);
    const curDiff = spline.derivative(t);

    // 도함수의 부호가 바뀌는 지점 (f'(t) = 0 근처)
    if (prevDiff * curDiff <= 0 && prevDiff !== 0) {
      // 이분법으로 정확한 영점(분 단위 정밀도) 탐색
      let l = t - stepMin;
      let r = t;
      for (let iter = 0; iter < 15; iter++) {
        const m = (l + r) / 2;
        const dm = spline.derivative(m);
        if (dm * spline.derivative(l) <= 0) {
          r = m;
        } else {
          l = m;
        }
      }
      const exactT = (l + r) / 2;
      const height = spline.evaluate(exactT);
      const isHigh = prevDiff > 0 && curDiff < 0; // 증가하다 감소: 만조
      extrema.push({
        timeMinutes: exactT,
        type: isHigh ? 'high' : 'low',
        typeKr: isHigh ? '고(만조)' : '저(간조)',
        height: Math.round(height)
      });
    }

    prevVal = curVal;
    prevDiff = curDiff;
  }
  return extrema;
}

// 5. 메인 비교 실행 함수
async function main() {
  const obsCode = 'DT_0001'; // 인천 조위관측소
  const targetDate = '20261027'; // 분석 대상일 (오늘)

  console.log('================================================================');
  console.log(' [조석 계산 알고리즘 검증 및 KHOA 모바일 예보 비교 프로그램]');
  console.log(` 관측소: 인천 (${obsCode}) | 대상일: ${targetDate}`);
  console.log('================================================================\n');

  // 1) 어제, 오늘, 내일 72시간 데이터 수집 (어제=20261026, 오늘=20261027, 내일=20261028)
  console.log('1. KHOA 공공데이터 API로부터 어제/오늘/내일 (72시간) 조위 데이터 수집 중...');
  const [day1, day2, day3] = await Promise.all([
    fetchDayData(obsCode, '20261026'),
    fetchDayData(obsCode, '20261027'),
    fetchDayData(obsCode, '20261028')
  ]);

  const allItems = [...day1, ...day2, ...day3];
  console.log(`   총 수집된 60분 간격 데이터 포인트 수: ${allItems.length}개`);

  // 시계열 데이터 구성 (분 단위 x, 조위 y)
  // 기준 시점: 2026-10-26 00:00 (t=0)
  const baseEpoch = new Date('2026-10-26T00:00:00+09:00').getTime();
  const xs = [];
  const ys = [];

  for (const item of allItems) {
    const itemEpoch = new Date(item.obsrvnDt.replace(' ', 'T') + ':00+09:00').getTime();
    const minutes = (itemEpoch - baseEpoch) / (1000 * 60);
    // 실측치(bscTdlvHgt) 우선, 없으면 예측치(tdlvHgt)
    const hgt = (item.bscTdlvHgt !== null && item.bscTdlvHgt !== undefined && item.bscTdlvHgt !== '') 
                ? Number(item.bscTdlvHgt) 
                : Number(item.tdlvHgt);
    xs.push(minutes);
    ys.push(hgt);
  }

  // 2) 큐빅 스플라인 곡선 생성
  console.log('2. 60분 간격 데이터로 삼차 스플라인(Cubic Spline) 보간 곡선 생성...');
  const spline = new CubicSpline(xs, ys);

  // 3) 오늘(2026-10-27 00:00 ~ 23:59) 구간의 극대점(만조), 극소점(간조) 탐색
  const todayStartMin = 24 * 60; // 2026-10-27 00:00
  const todayEndMin = 48 * 60;   // 2026-10-27 24:00
  console.log('3. 스플라인 1차 미분(f\'(t)=0)을 통한 만조/간조 정밀 추정...');
  const computedExtrema = findExtrema(spline, todayStartMin, todayEndMin);

  // 4) KHOA 모바일 공식 예보치 조회
  console.log('4. KHOA 모바일 (https://www.khoa.go.kr/swtc/mobile.do) 공식 데이터 조회 중...');
  const weeklyData = await fetchKhoaMobileData(obsCode, targetDate);
  const todayOfficial = weeklyData.find(w => w.searchDate === '2026-10-27') || weeklyData[0];

  console.log('\n================================================================');
  console.log(' [결과 비교: 스플라인 보간 추정치 vs KHOA 공식 모바일 예보]');
  console.log('================================================================');

  // 공식 극치 파싱
  const officialExtrema = [];
  for (const key of ['lvl1', 'lvl2', 'lvl3', 'lvl4']) {
    const val = todayOfficial[key];
    if (val && val !== '-') {
      const [tStr, typeStr, krStr, hgtStr] = val.split('/');
      officialExtrema.push({
        time: tStr,
        type: typeStr,
        typeKr: krStr,
        height: parseInt(hgtStr, 10)
      });
    }
  }

  console.log('\n--- KHOA 모바일 공식 예보 (https://www.khoa.go.kr/swtc/mobile.do) ---');
  console.log(`- 날짜: ${todayOfficial.searchDate} (음력: ${todayOfficial.dateMoon})`);
  console.log(`- 물때: 일반 [${todayOfficial.moolNormal}], 서해(8물제) [${todayOfficial.mool8}], 남해(7물제) [${todayOfficial.mool7}]`);
  console.log(`- 조석 상태: ${todayOfficial.moonState}`);
  officialExtrema.forEach((item, idx) => {
    console.log(`  [공식 ${idx + 1}] ${item.typeKr}조: ${item.time} (${item.height}cm)`);
  });

  console.log('\n--- 60분 간격 데이터 스플라인 보간 추정 결과 ---');
  computedExtrema.forEach((item, idx) => {
    const minsFromDayStart = item.timeMinutes - todayStartMin;
    const hh = String(Math.floor(minsFromDayStart / 60)).padStart(2, '0');
    const mm = String(Math.floor(minsFromDayStart % 60)).padStart(2, '0');
    item.formattedTime = `${hh}:${mm}`;
    console.log(`  [추정 ${idx + 1}] ${item.typeKr}: ${item.formattedTime} (${item.height}cm)`);
  });

  console.log('\n--- 정밀도 오차 분석 (추정치 - 공식치) ---');
  officialExtrema.forEach((off, idx) => {
    const comp = computedExtrema[idx];
    if (comp) {
      const [offH, offM] = off.time.split(':').map(Number);
      const [cmpH, cmpM] = comp.formattedTime.split(':').map(Number);
      const offTotalM = offH * 60 + offM;
      const cmpTotalM = cmpH * 60 + cmpM;
      const diffM = cmpTotalM - offTotalM;
      const diffHgt = comp.height - off.height;
      console.log(`  - ${off.typeKr}조: 시간 오차 ${diffM >= 0 ? '+' : ''}${diffM}분 | 조위 오차 ${diffHgt >= 0 ? '+' : ''}${diffHgt}cm`);
    }
  });

  console.log('\n================================================================\n');
}

main().catch(console.error);
