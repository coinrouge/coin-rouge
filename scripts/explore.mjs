import * as cheerio from "cheerio";
const UA = "CoinRouge/0.2 (https://github.com/coinrouge/coin-rouge)";
const txt = (s) => s.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
async function get(title) {
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title.replace(/ /g, "_"))}`, { headers: { "User-Agent": UA } });
  console.log(`\n===== ${title} → HTTP ${r.status}`);
  return r.ok ? cheerio.load(await r.text()) : null;
}
let $ = await get("2026 in Zuffa Boxing");
if ($) {
  $("table").slice(0, 4).each((i, t) => { console.log(`--- table #${i}`); $(t).find("tr").slice(0, 20).each((_, tr) => console.log("  " + $(tr).find("th,td").map((_, c) => txt($(c).text())).get().join(" | ").slice(0, 200))); });
  $("h2").each((_, h) => { const sec = $(h).closest("section"); console.log("H2", txt($(h).text()), "| p:", txt(sec.find("p").first().text()).slice(0, 220)); });
}
$ = await get("2027 in Zuffa Boxing");
$ = await get("List of current world boxing champions");
if ($) $("table").slice(0, 6).each((i, t) => { console.log(`--- table #${i}`); $(t).find("tr").slice(0, 5).each((_, tr) => console.log("  " + $(tr).find("th,td").map((_, c) => { const img = $(c).find("img").attr("alt") || $(c).find(".flagicon a").attr("title") || ""; return (img ? `[${img}] ` : "") + txt($(c).text()); }).get().join(" | ").slice(0, 260))); });
for (const t of ["List of current boxing rankings", "The Ring Pound for Pound", "List of French boxers", "Liste de boxeurs français"]) await get(t);
