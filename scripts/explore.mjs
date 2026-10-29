// Exploration : ce que Wikipédia renvoie pour les pages utiles au site.
import * as cheerio from "cheerio";
const UA = "CoinRouge/0.1 (https://github.com/coinrouge/coin-rouge)";
async function html(title) {
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title)}`, { headers: { "User-Agent": UA } });
  console.log(`\n===== ${title} → HTTP ${r.status}`);
  return r.ok ? cheerio.load(await r.text()) : null;
}
const txt = (el) => el.text().replace(/\s+/g, " ").trim();
function dumpTables($, filter, maxRows = 40) {
  $("table").each((ti, t) => {
    const rows = $(t).find("tr").map((_, tr) => $(tr).find("th,td").map((_, c) => txt($(c))).get().join(" | ")).get();
    if (!rows.some((r) => filter.test(r))) return;
    console.log(`--- table #${ti} (${rows.length} lignes)`);
    rows.slice(0, maxRows).forEach((r) => console.log("  " + r));
  });
}
for (const ev of ["UFC_334", "UFC_333", "UFC_Fight_Night:_Moicano_vs._Nolan", "UFC_Fight_Night:_Bonfim_vs._Brady", "UFC_335"]) {
  const $ = await html(ev);
  if (!$) continue;
  console.log("Titres :", $("h2,h3").map((_, h) => txt($(h))).get().join(" / "));
  dumpTables($, /(Main card|Preliminary|def\.|vs\.)/i);
}
{
  const $ = await html("2026_in_UFC");
  if ($) dumpTables($, /(Scheduled|Gane|Hokit|Oliveira)/i, 15);
}
{
  const $ = await html("List_of_current_UFC_fighters");
  if ($) {
    let n = 0, ex = [];
    $("table tr").each((_, tr) => {
      const c = $(tr).find("td").map((_, td) => txt($(td))).get();
      if (c.length >= 8) { n++; if (/Gane|Moicano|Parnasse|Saint Denis|Imavov|Fiorot/.test(c.join(" "))) ex.push(c.join(" | ")); }
    });
    console.log(`Lignes combattants : ${n}`);
    ex.forEach((e) => console.log("  " + e));
    const first = $("table tr").filter((_, tr) => $(tr).find("td").length >= 8).first();
    console.log("Exemple HTML 1re ligne :", $.html(first).slice(0, 600));
  }
}
