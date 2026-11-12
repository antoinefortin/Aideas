export function recordingFilename(title, url, date = new Date()) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
  const clean = value => value.normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  const name = clean(title || 'Untitled recording').slice(0, 110).trim();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `Tabtone/${name || 'Untitled recording'}${host ? ` — ${clean(host)}` : ''} — ${stamp}.mp3`;
}
