import https from 'https';

const q = process.argv[2] ?? 'secte France (cult OR cults OR secte OR sectes)';
const u =
  'https://news.google.com/rss/search?q=' +
  encodeURIComponent(q) +
  '&hl=fr&gl=FR&ceid=FR:fr';

const body = await new Promise((resolve, reject) => {
  https
    .get(
      u,
      { headers: { 'User-Agent': 'FreedomTimes-Local-Agent/0.1', Accept: 'application/rss+xml' } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      },
    )
    .on('error', reject);
});

const dates = [];
const itemRe = /<item[\s\S]*?<\/item>/gi;
let m;
while ((m = itemRe.exec(body)) !== null) {
  const block = m[0];
  const pm = block.match(/<pubDate>([^<]+)<\/pubDate>/i);
  if (pm) {
    const t = Date.parse(pm[1].trim());
    if (Number.isFinite(t)) {
      dates.push(t);
    }
  }
}

dates.sort((a, b) => a - b);
const now = Date.now();
const h168 = 168 * 3600000;
const h24 = 24 * 3600000;
const in168h = dates.filter((t) => now - t <= h168 && now - t >= 0).length;
const in24h = dates.filter((t) => now - t <= h24 && now - t >= 0).length;

console.log('URL', u);
console.log('items with parseable pubDate:', dates.length);
if (dates.length > 0) {
  console.log('earliest (oldest) pubDate in this feed:', new Date(dates[0]).toISOString());
  console.log('latest (newest) pubDate in this feed:', new Date(dates[dates.length - 1]).toISOString());
  console.log('items with pubDate within last 24h (clock):', in24h);
  console.log('items with pubDate within last 168h:', in168h);
}

const fr = body.includes('franceinfo');
console.log('raw XML contains "franceinfo":', fr);
console.log('server now:', new Date().toISOString());
const may2026 = (body.match(/2026-05-[0-9]{2}/g) ?? []).length;
const lateApr = (body.match(/2026-04-2[0-9]/g) ?? []).length;
console.log('rough count of 2026-05-** strings in xml:', may2026);
console.log('rough count of 2026-04-2* strings in xml:', lateApr);
