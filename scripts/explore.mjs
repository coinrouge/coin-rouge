import * as cheerio from "cheerio";
const UA = "CoinRouge/0.2 (https://github.com/coinrouge/coin-rouge)";
const txt = (s) => s.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
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
await dump("2026 in Zuffa Boxing", /(Event|vs)/, 30);
await dump("2026 in Professional Fighters League", /(Event|Date)/, 30);
await dump("List of current PFL fighters", /(Lapilus|McKee|Nemkov)/, 6);
await dump("ARES Fighting Championship", /(2026|2027|ARES ?\d)/, 40, "fr");
await dump("PFL Dubai: Nemkov vs. Bilostenniy", /(Weight class|vs\.)/);
