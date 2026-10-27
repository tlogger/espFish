async function checkAll() {
  const res = await fetch('https://www.khoa.go.kr/swtc/mobile.do');
  const txt = await res.text();
  const regex = /<option[^>]*value=["'](DT_[0-9]+)["'][^>]*>(.*?)<\/option>/gi;
  let match;
  const stations = [];
  while ((match = regex.exec(txt)) !== null) {
    stations.push({ code: match[1], name: match[2].trim() });
  }
  
  // 시화방조제 근처 관측소들 확인 (안산, 인천, 영흥도, 평택, 덕적도 등)
  const nearbyCandidates = stations.filter(s => 
    ['인천', '안산', '영흥도', '평택', '경인항', '대산', '덕적도'].some(name => s.name.includes(name))
  );
  console.log('Nearby candidates in KHOA:', nearbyCandidates);
}

checkAll();
