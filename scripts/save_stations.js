import fs from 'fs';

async function generateStationsJson() {
  const res = await fetch('https://www.khoa.go.kr/swtc/mobile.do');
  const txt = await res.text();
  const regex = /<option[^>]*value=["'](DT_[0-9]+)["'][^>]*>(.*?)<\/option>/gi;
  let match;
  const stations = [];
  while ((match = regex.exec(txt)) !== null) {
    stations.push({ code: match[1], name: match[2].trim() });
  }

  const serviceKey = '7Q54Z6DQ%2B9wH23fR%2FAlrOSh4XgQ9xyA8I%2F69h1tmrlCwtFqMG8zdR01z0h8%2Bo%2Ft1Uvt%2BwoN947y1ts5Maeoy%2Bg%3D%3D';
  const detailed = [];

  for (let i = 0; i < stations.length; i += 10) {
    const chunk = stations.slice(i, i + 10);
    const promises = chunk.map(async (st) => {
      try {
        const url = `https://apis.data.go.kr/1192136/surveyTideLevel/GetSurveyTideLevelApiService?serviceKey=${serviceKey}&type=json&obsCode=${st.code}&reqDate=20261027&min=60&numOfRows=1&pageNo=1`;
        const r = await fetch(url);
        const d = await r.json();
        const item = d.body?.items?.item?.[0];
        if (item && item.lat && item.lot) {
          const lat = Number(Number(item.lat).toFixed(4));
          const lng = Number(Number(item.lot).toFixed(4));
          let region = 'WEST';
          if (lat < 34.0 || st.name.includes('제주') || st.name.includes('서귀포') || st.name.includes('모슬포') || st.name.includes('성산') || st.name.includes('추자')) {
            region = 'JEJU';
          } else if (lat < 35.3 && lng >= 126.3) {
            region = 'SOUTH';
          } else if (lng >= 129.2 || (lat >= 35.5 && lng >= 129.0)) {
            region = 'EAST';
          } else {
            region = 'WEST';
          }

          // 권역 보정 (포항, 울산, 묵호, 속초, 후포, 삼척, 울릉도, 독도 등)
          if (['울산', '포항', '후포', '동해항', '묵호', '삼척', '속초', '울릉도', '독도'].some(n => st.name.includes(n))) {
            region = 'EAST';
          }

          return {
            code: st.code,
            name: st.name,
            region,
            lat,
            lng,
          };
        }
      } catch (e) {}
      return null;
    });

    const results = await Promise.all(promises);
    results.forEach(r => { if (r) detailed.push(r); });
  }

  // 중복 제거 및 이름순 정렬
  const uniqueMap = new Map();
  detailed.forEach(d => uniqueMap.set(d.code, d));
  const finalStations = Array.from(uniqueMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  fs.writeFileSync('scripts/khoa_all_stations.json', JSON.stringify(finalStations, null, 2), 'utf-8');
  console.log(`성공적으로 ${finalStations.length}개 KHOA 조위관측소 메타데이터를 저장했습니다.`);
}

generateStationsJson();
