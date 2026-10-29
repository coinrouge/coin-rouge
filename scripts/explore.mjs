import * as cheerio from "cheerio";
const UA = "CoinRouge/0.2 (https://github.com/coinrouge/coin-rouge)";
const txt = (s) => s.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
const search = async (q, n = 10) => (await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=${n}&srsearch=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA } })).json()).query.search.map((x) => x.title);
async function dump(title, filter = /./, max = 30) {
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title.replace(/ /g, "_"))}`, { headers: { "User-Agent": UA } });
  console.log(`\n===== ${title} → HTTP ${r.status}`);
  if (!r.ok) return;
  const $ = cheerio.load(await r.text());
  $("table").each((i, t) => {
    if ($(t).closest(".navbox").length) return;
    const rows = $(t).find("tr").map((_, tr) => $(tr).find("th,td").map((_, c) => txt($(c).text())).get().join(" | ")).get();
    if (!rows.some((x) => filter.test(x))) return;
    console.log(`--- table #${i} (${rows.length} lignes)`);
    rows.slice(0, max).forEach((x) => console.log("  " + x.slice(0, 200)));
  });
}
for (const q of ['intitle:"vs." boxing 2026 scheduled fight', 'boxing "is scheduled to take place" 2026 November', 'boxing "is scheduled to take place" December 2026', 'Usyk next fight 2026', 'Inoue 2026 fight']) console.log(`\n### ${q} : ${(await search(q)).join(" / ")}`);
const cat = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmlimit=100&format=json&cmtitle=Category:2026_in_boxing`, { headers: { "User-Agent": UA } })).json();
console.log("\n### Category:2026 in boxing :", (cat.query?.categorymembers || []).map((x) => x.title).join(" / "));
await dump("List of current world boxing champions", /(vs|Next|Scheduled)/i, 12);
await dump("Canelo Álvarez vs. Christian M'billi", /(Weight|vs)/);
