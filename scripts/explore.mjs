// Exploration ponctuelle : PFL et boxe sur Wikipédia
import * as cheerio from "cheerio";
const UA = "CoinRouge/0.2 (https://github.com/coinrouge/coin-rouge)";
const api = async (q) => (await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=5&srsearch=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA } })).json();
const txt = (s) => s.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
async function dump(title, filter = /./, max = 45) {
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title.replace(/ /g, "_"))}`, { headers: { "User-Agent": UA } });
  console.log(`\n===== ${title} → HTTP ${r.status}`);
  if (!r.ok) return;
  const $ = cheerio.load(await r.text());
  console.log("Titres :", $("h2,h3").map((_, h) => txt($(h).text())).get().join(" / "));
  $("table").each((i, t) => {
    if ($(t).hasClass("navbox") || $(t).closest(".navbox").length) return;
    const rows = $(t).find("tr").map((_, tr) => $(tr).find("th,td").map((_, c) => txt($(c).text())).get().join(" | ")).get();
    if (!rows.some((x) => filter.test(x))) return;
    console.log(`--- table #${i} (${rows.length} lignes)`);
    rows.slice(0, max).forEach((x) => console.log("  " + x.slice(0, 260)));
  });
}
for (const q of ["PFL Lyon 2026 Lapilus McKee", "PFL Dubai Nemkov Bilostenniy", "Canelo Álvarez vs. Christian Mbilli", "Tyson Fury vs. Anthony Joshua 2026", "Joshua Buatsi Willy Hutchinson", "Hexagone MMA", "Ares Fighting Championship"]) {
  const s = await api(q);
  console.log(`\n### Recherche « ${q} » : ${s.query.search.map((x) => x.title).join(" / ")}`);
}
await dump("2026 in Professional Fighters League", /(Lyon|Dubai|Nov|Dec)/i, 40);
await dump("2026 in boxing", /(Oct|Nov|Dec|October|November|December)/, 60);
await dump("Hexagone MMA", /(2026|2027)/, 40);
await dump("Ares Fighting Championship", /(2026|2027|ARES 4)/i, 40);
