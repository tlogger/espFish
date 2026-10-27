async function getStations() {
  const res = await fetch('https://www.khoa.go.kr/swtc/mobile.do');
  const txt = await res.text();
  const regex = /<option[^>]*value=["'](DT_[0-9]+)["'][^>]*>(.*?)<\/option>/gi;
  let match;
  const stations = [];
  while ((match = regex.exec(txt)) !== null) {
    stations.push({ code: match[1], name: match[2].trim() });
  }
  console.log('Total stations found:', stations.length);
  console.log('Stations:', JSON.stringify(stations.slice(0, 30), null, 2));
}

getStations();
