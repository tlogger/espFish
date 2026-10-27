async function checkBadatimeIncheon() {
  const res = await fetch('https://www.badatime.com/j-373.html');
  const txt = await res.text();
  const idx = txt.indexOf('2026-10-27');
  if (idx !== -1) {
    console.log(txt.substring(idx - 400, idx + 1000));
  }
}
checkBadatimeIncheon();
