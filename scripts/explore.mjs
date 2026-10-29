// Exploration ponctuelle (2) : page PFL Lyon, boxe, organisations françaises (fr.wikipedia)
import * as cheerio from "cheerio";
const UA = "CoinRouge/0.2 (https://github.com/coinrouge/coin-rouge)";
const txt = (s) => s.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
const search = async (q, lang = "en") => (await (await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=8&srsearch=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA } })).json()).query.search.map((x) => x.title);
async function dump(title, filter = /./, max = 40, lang = "en") {
  const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title.replace(/ /g, "_"))}`, { headers: { "User-Agent": UA } });
  console.log(`\n===== [${lang}] ${title} → HTTP ${r.status}`);
  if (!r.ok) return;
  const $ = cheerio.load(await r.text());
  console.log("Titres :", $("h2,h3").map((_, h) => txt($(h).text())).get().join(" / "));
  $("table").each((i, t) => {
    if ($(t).closest(".navbox").length) return;
    const rows = $(t).find("tr").map((_, tr) => $(tr).find("th,td").map((_, c) => txt($(c).text())).get().join(" | ")).get();
    if (!rows.some((x) => filter.test(x))) return;
    console.log(`--- table #${i} (${rows.length} lignes)`);
    rows.slice(0, max).forEach((x) => console.log("  " + x.slice(0, 220)));
  });
}
await dump("PFL Lyon: Lapilus vs. McKee", /(Weight class|vs\.)/);
for (const q of ["2026 in boxing", "list of boxing events 2026", "Canelo Mbilli", "Fury Joshua December 2026 fight"]) console.log(`\n### [en] ${q} : ${(await search(q)).join(" / ")}`);
for (const q of ["Hexagone MMA", "ARES Fighting Championship", "Canelo Mbilli 2026"]) console.log(`\n### [fr] ${q} : ${(await search(q, "fr")).join(" / ")}`);
await dump("Hexagone MMA", /(2026|2027)/, 40, "fr");
await dump("Ares Fighting Championship", /(2026|2027)/, 40, "fr");
await dump("2026 en boxe anglaise", /(octobre|novembre|décembre)/i, 50, "fr");
