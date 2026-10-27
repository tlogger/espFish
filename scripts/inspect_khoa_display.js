// KHOA 모바일 페이지에서 mool7과 mool8을 어떻게 표시하는지 스크립트를 찾아보자
async function inspectKhoaMobileDisplayLogic() {
  const res = await fetch('https://www.khoa.go.kr/swtc/mobile.do');
  const txt = await res.text();
  
  // mool7, mool8, moolNormal 관련 코드를 전부 검색
  const lines = txt.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('mool7') || line.includes('mool8') || line.includes('moolNormal')) {
      console.log(`Line ${idx + 1}: ${line}`);
    }
  });
}

inspectKhoaMobileDisplayLogic();
