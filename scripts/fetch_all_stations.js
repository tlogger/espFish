// 64개 모든 관측소의 메타데이터를 수집
async function fetchAllStationDetails() {
  const res = await fetch('https://www.khoa.go.kr/swtc/mobile.do');
  const txt = await res.text();
  const regex = /<option[^>]*value=["'](DT_[0-9]+)["'][^>]*>(.*?)<\/option>/gi;
  let match;
  const stations = [];
  while ((match = regex.exec(txt)) !== null) {
    stations.push({ code: match[1], name: match[2].trim() });
  }

  console.log(`총 ${stations.length}개 관측소 발견`);
  
  // 각 관측소의 위경도 및 권역 판별
  // KHOA API 1건 조회를 통해 lat, lot 취득
  const serviceKey = '7Q54Z6DQ%2B9wH23fR%2FAlrOSh4XgQ9xyA8I%2F69h1tmrlCwtFqMG8zdR01z0h8%2Bo%2Ft1Uvt%2BwoN947y1ts5Maeoy%2Bg%3D%3D';
  
  const detailed = [];
  // 청크 단위(10개씩)로 병렬 처리
  for (let i = 0; i < stations.length; i += 10) {
    const chunk = stations.slice(i, i + 10);
    const promises = chunk.map(async (st) => {
      try {
        const url = `https://apis.data.go.kr/1192136/surveyTideLevel/GetSurveyTideLevelApiService?serviceKey=${serviceKey}&type=json&obsCode=${st.code}&reqDate=20261027&min=60&numOfRows=1&pageNo=1`;
        const r = await fetch(url);
        const d = await r.json();
        const item = d.body?.items?.item?.[0];
        if (item && item.lat && item.lot) {
          const lat = Number(item.lat);
          const lng = Number(item.lot);
          let region = 'WEST';
          if (lat < 34.0) region = 'JEJU';
          else if (lat < 35.3 && lng >= 126.3) region = 'SOUTH';
          else if (lng >= 129.2 || (lat >= 36.0 && lng >= 129.0)) region = 'EAST';
          else region = 'WEST';

          return {
            code: st.code,
            name: st.name,
            lat,
            lng,
            region
          };
        }
      } catch (e) {}
      return null;
    });

    const results = await Promise.all(promises);
    results.forEach(r => { if (r) detailed.push(r); });
  }

  console.log(`상세 정보 취득 성공: ${detailed.length}개 관측소`);
  return detailed;
}

fetchAllStationDetails().then(d => {
  console.log('샘플 10개:', JSON.stringify(d.slice(0, 10), null, 2));
});
