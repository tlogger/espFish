async function checkTongyeongTide() {
  const res = await fetch('https://www.badatime.com/j-37.html');
  const txt = await res.text();
  const idx = txt.indexOf('2026-10-27');
  if (idx !== -1) {
    console.log(txt.substring(idx - 1800, idx - 1200));
  }
}
checkTongyeongTide();
