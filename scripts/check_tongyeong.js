// 통영 badatime: https://www.badatime.com/j-37.html
async function checkBadatimeTongyeong() {
  const res = await fetch('https://www.badatime.com/j-37.html');
  const txt = await res.text();
  const idx = txt.indexOf('2026-10-27');
  if (idx !== -1) {
    console.log(txt.substring(idx - 2500, idx - 1800));
  }
}
checkBadatimeTongyeong();
