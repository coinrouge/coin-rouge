// Coin Rouge : met à jour data/events.json à partir de Wikipédia (en.wikipedia.org).
// Contenu Wikipédia sous licence CC BY-SA : la source est créditée sur le site.
import * as cheerio from "cheerio";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const UA = "CoinRouge/0.2 (https://github.com/coinrouge/coin-rouge; site de fight cards)";
const DAY = 864e5;
const now = Date.now();

async function page(title) {
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title.replace(/ /g, "_"))}`, { headers: { "User-Agent": UA } });
  if (!r.ok) { console.log(`  ${title} : HTTP ${r.status}`); return null; }
  return cheerio.load(await r.text());
}
const clean = (s) => s.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
const cell = ($, el) => clean($(el).text());

/* ---------- Correspondances ---------- */
const WEIGHT_ = {
  "Heavyweight": "HW", "Light Heavyweight": "LHW", "Middleweight": "MW", "Welterweight": "WW", "Lightweight": "LW",
  "Featherweight": "FW", "Bantamweight": "BW", "Flyweight": "FLW", "Women's Featherweight": "WFW",
  "Women's Bantamweight": "WBW", "Women's Flyweight": "WFLW", "Women's Strawweight": "WSW",
};
const WEIGHT = new Proxy(WEIGHT_, { get: (o, k) => Object.entries(o).find(([x]) => x.toLowerCase() === String(k).toLowerCase())?.[1] });
const COUNTRY = {
  France: "FRA", Brazil: "BRA", Australia: "AUS", "New Zealand": "NZL", "United Kingdom": "GBR", England: "GBR", Scotland: "GBR",
  Wales: "GBR", "Northern Ireland": "GBR", "United States": "USA", Russia: "RUS", Netherlands: "NED", Serbia: "SRB",
  Slovakia: "SVK", Lithuania: "LTU", Azerbaijan: "AZE", Venezuela: "VEN", Iraq: "IRQ", Peru: "PER", Mexico: "MEX",
  Sweden: "SWE", Japan: "JPN", "South Korea": "KOR", "Czech Republic": "CZE", Czechia: "CZE", Argentina: "ARG",
  Kazakhstan: "KAZ", Georgia: "GEO", Bahrain: "BHR", Jamaica: "JAM", Indonesia: "IDN",
  "Georgia (country)": "GEO", Germany: "GER", Italy: "ITA", Belgium: "BEL", Austria: "AUT", Hungary: "HUN", Cameroon: "CMR",
  Canada: "CAN", China: "CHN", Turkey: "TUR", Uzbekistan: "UZB", Iran: "IRI", Croatia: "CRO", Ecuador: "ECU", Kyrgyzstan: "KGZ",
  Tajikistan: "TJK", Myanmar: "MYA", Angola: "ANG", Aruba: "ARU", Poland: "POL", Spain: "ESP", Portugal: "POR", Ireland: "IRL",
  "Republic of Ireland": "IRL", Ukraine: "UKR", Moldova: "MDA", Armenia: "ARM", Chile: "CHI", Colombia: "COL", Ecuador_: "ECU",
  Norway: "NOR", Denmark: "DEN", Finland: "FIN", Switzerland: "SUI", Philippines: "PHI", Thailand: "THA", "Dagestan": "RUS", "United Arab Emirates": "UAE", "Saudi Arabia": "KSA", Qatar: "QAT", Morocco: "MAR", Algeria: "ALG", Tunisia: "TUN", Senegal: "SEN", "DR Congo": "COD",
  "Democratic Republic of the Congo": "COD", Nigeria: "NGR", "South Africa": "RSA", Rwanda: "RWA", Egypt: "EGY", Jordan: "JOR", Lebanon: "LBN",
  Chechnya: "RUS", Belarus: "BLR", Romania: "ROU", Bulgaria: "BUL", Greece: "GRE", Latvia: "LAT", Estonia: "EST", Mongolia: "MGL", Afghanistan: "AFG",
  Guyana: "GUY", "Cuba": "CUB", "Dominican Republic": "DOM", "Puerto Rico": "PUR", Haiti: "HAI", Suriname: "SUR", "Ivory Coast": "CIV", Ghana: "GHA", Zambia: "ZAM", Kenya: "KEN", Uganda: "UGA",
};
function tzFor(city, country) {
  const c = `${city} ${country}`;
  if (/Las Vegas|Nevada|Glendale|Phoenix|Seattle|Sacramento|Los Angeles|Anaheim|San Diego/.test(c)) return "America/Los_Angeles";
  if (/Denver|Salt Lake/.test(c)) return "America/Denver";
  if (/Chicago|Nashville|Houston|Dallas|San Antonio|Kansas|Oklahoma|Austin|Milwaukee|Texas|South Dakota|Illinois|Tennessee|Minnesota|Iowa|Wisconsin|Louisiana|Missouri/.test(c)) return "America/Chicago";
  if (/United States/.test(c)) return "America/New_York";
  const T = { Qatar: "Asia/Qatar", "United Arab Emirates": "Asia/Dubai", "Saudi Arabia": "Asia/Riyadh", Australia: "Australia/Sydney",
    France: "Europe/Paris", "United Kingdom": "Europe/London", England: "Europe/London", Scotland: "Europe/London", Wales: "Europe/London", "Northern Ireland": "Europe/London",
    Ireland: "Europe/Dublin", Belgium: "Europe/Brussels", Spain: "Europe/Madrid", Germany: "Europe/Berlin", Italy: "Europe/Rome", Netherlands: "Europe/Amsterdam", Poland: "Europe/Warsaw", Canada: "America/Toronto", Brazil: "America/Sao_Paulo",
    Mexico: "America/Mexico_City", China: "Asia/Shanghai", Macau: "Asia/Macau", Azerbaijan: "Asia/Baku", Singapore: "Asia/Singapore", Japan: "Asia/Tokyo" };
  for (const k in T) if (c.includes(k)) return T[k];
  return "America/New_York";
}
const METHOD = [
  [/^Technical Submission/i, "Soumission technique"], [/^Submission/i, "Soumission"], [/^TKO/i, "TKO"], [/^KO/i, "KO"],
  [/^Decision \(unanimous\)/i, "Décision unanime"], [/^Decision \(split\)/i, "Décision partagée"], [/^Decision \(majority\)/i, "Décision majoritaire"],
  [/^Draw/i, "Match nul"], [/^No Contest/i, "No contest"], [/^DQ|Disqualification/i, "Disqualification"],
];
const DETAIL = { punches: "coups de poing", elbows: "coudes", knee: "genou", knees: "genoux", "head kick": "high kick", "body kick": "coup de pied au corps",
  "corner stoppage": "abandon du coin", "doctor stoppage": "arrêt médical", "rear-naked choke": "étranglement arrière", "guillotine choke": "guillotine",
  "arm-triangle choke": "arm-triangle", armbar: "clé de bras", "triangle choke": "triangle", "head kick and punches": "high kick et coups",
  "knee and punches": "genou et coups", "elbows and punches": "coudes et coups", "punch": "coup de poing", "spinning back kick": "coup de pied retourné" };
function method(raw) {
  for (const [re, fr] of METHOD) if (re.test(raw)) {
    if (/^Decision|^Draw|^No Contest/i.test(raw)) return fr;
    const d = (raw.match(/\(([^)]+)\)/) || [])[1];
    return d ? `${fr} (${DETAIL[d.toLowerCase()] || d})` : fr;
  }
  return raw;
}

/* ---------- Fuseau : heure locale → UTC ---------- */
function offsetMs(utc, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(utc)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - utc;
}
function localToUtc(dateIso, hhmm, tz) {
  const [y, m, d] = dateIso.split("-").map(Number), [h, mi] = hhmm.split(":").map(Number);
  let t = Date.UTC(y, m - 1, d, h, mi);
  t -= offsetMs(t, tz); t = Date.UTC(y, m - 1, d, h, mi) - offsetMs(t, tz);
  return new Date(t).toISOString().replace(".000", "");
}

/* ---------- Combattants (nationalité, record) ---------- */
async function fighters() {
  const map = {};
  for (const list of ["List of current UFC fighters", "List of current PFL fighters"]) {
  const $ = await page(list);
  if (!$) continue;
  $("table tr").each((_, tr) => {
    const td = $(tr).find("td");
    if (td.length < 8) return;
    const name = cell($, td[1]).replace(/\s*\((c|ic)\)$/i, "");
    if (!name || /^\d/.test(name)) return;
    const f = $(td[0]);
    let country = f.find("a").attr("title") || f.find("img").attr("alt") || "";
    if (!country) { const src = f.find("img").attr("src") || ""; const m = src.match(/Flag_of_(?:the_)?([^./]+)/); if (m) country = decodeURIComponent(m[1]).replace(/_/g, " "); }
    const recm = cell($, td[td.length - 1]).match(/^(\d+)\s*[–-]\s*(\d+)(?:\s*[–-]\s*(\d+))?/);
    if (!map[name]) map[name] = { nat: COUNTRY[country] || country || "", rec: recm ? [+recm[1], +recm[2], +(recm[3] || 0)] : null };
  });
  }
  console.log(`Combattants : ${Object.keys(map).length}`);
  return map;
}

/* Combattant absent des listes : on lit sa propre page Wikipédia (résultat gardé en cache) */
const cacheFile = new URL("../data/fighters-cache.json", import.meta.url);
const cache = JSON.parse(await readFile(cacheFile, "utf8").catch(() => "{}"));
async function lookup(name, roster) {
  if (roster[name]?.nat) return roster[name];
  if (name in cache && (cache[name] === null || cache[name].v === 4)) return cache[name];
  let out = null;
  const $ = await page(name);
  if ($ && /mixed martial art/i.test($("p").slice(0, 3).text())) {
    const info = {};
    $("table.infobox tr").each((_, tr) => { const k = cell($, $(tr).find("th").first()), v = cell($, $(tr).find("td").first()); if (k && v) info[k] = v; });
    let nat = "";
    const raw = [(info.Born || "").split(",").pop(), info.Nationality, info.Citizenship].filter(Boolean).join(" / ");
    const DEMONYM = { American: "USA", "U.S.": "USA", US: "USA", Brazilian: "BRA", French: "FRA", British: "GBR", English: "GBR", Scottish: "GBR", Welsh: "GBR",
      Irish: "IRL", Russian: "RUS", Mexican: "MEX", Canadian: "CAN", Australian: "AUS", Polish: "POL", Belgian: "BEL", Swiss: "SUI", German: "GER",
      Italian: "ITA", Spanish: "ESP", Dutch: "NED", Japanese: "JPN", Chinese: "CHN", Georgian: "GEO", Ukrainian: "UKR", Moroccan: "MAR", Algerian: "ALG" };
    for (const k of [...Object.keys(COUNTRY), ...Object.keys(DEMONYM)]) if (new RegExp(`(^|[^A-Za-z])${k.replace(/[.()]/g, "\\$&")}(?![a-z])`).test(raw)) { nat = COUNTRY[k] || DEMONYM[k]; break; }
    const n = (k) => +((info[k] || "").match(/^\d+/) || [0])[0];
    const rec = info.Total ? [n("Wins"), n("Losses"), n("Draws")] : null;
    if (!nat) console.log(`  nationalité inconnue : ${name} ← ${JSON.stringify({ N: info.Nationality, C: info.Citizenship, B: info.Born })}`);
    out = { nat, rec, v: 4 };
  }
  cache[name] = out;
  return out;
}

/* ---------- Liste des soirées ---------- */
function parseDate(s) { const t = Date.parse(s + " 12:00 UTC"); return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10); }
const PFL_TITLES = new Set();
const pairKey = (a, b) => [a, b].map((s) => s.replace(/\s*\((c|ic)\)/gi, "").trim()).sort().join("|");
async function eventList() {
  const out = [];
  for (const [org, year] of [["UFC", 2026], ["UFC", 2027], ["PFL", 2026], ["PFL", 2027]]) {
    const $ = await page(org === "UFC" ? `${year} in UFC` : `${year} in Professional Fighters League`);
    if (!$) continue;
    $("table").each((_, t) => {
      if (org === "PFL" && /^Title fights/.test(cell($, $(t).find("tr").first()))) {
        $(t).find("tr").each((_, tr) => { const c = $(tr).find("td,th").map((_, x) => cell($, x)).get(); if (/^(vs\.|def\.)/.test(c[2] || "")) PFL_TITLES.add(pairKey(c[1], c[3])); });
        return;
      }
      const head = $(t).find("tr").first().find("th").map((_, th) => cell($, th)).get();
      const iEv = head.indexOf("Event"), iDate = head.indexOf("Date");
      if (iEv < 0 || iDate < 0) return;
      $(t).find("tr").slice(1).each((_, tr) => {
        const c = $(tr).find("td,th").map((_, x) => cell($, x)).get();
        const name = c[iEv], date = parseDate(c[iDate] || "");
        // PFL : seulement les grandes soirées « Ville: A vs. B » (pas les ligues régionales Africa / MENA)
        if (name && date && (org === "UFC" ? /^UFC/.test(name) : /^PFL [^:]+:.+ vs\.? /.test(name) && !/^PFL (Africa|MENA)/.test(name))) out.push({ name, date, org });
      });
    });
  }
  const seen = new Set();
  return out.filter((e) => !seen.has(e.name) && seen.add(e.name));
}

/* ---------- Page d'une soirée ---------- */
async function eventPage(name) {
  const num = name.match(/^UFC (\d+)\b/);
  const title = num ? `UFC ${num[1]}` : name;
  const $ = await page(title);
  if (!$) return null;
  const info = {};
  $("table.infobox tr").each((_, tr) => { const k = cell($, $(tr).find("th").first()), v = cell($, $(tr).find("td").first()); if (k && v) info[k] = v; });
  const fights = [];
  $("table").each((_, t) => {
    if (!/Weight class/.test(cell($, $(t).find("tr").slice(0, 3)))) return;
    let seg = "main";
    $(t).find("tr").each((_, tr) => {
      const c = $(tr).find("td,th").map((_, x) => cell($, x)).get();
      if (c.length === 1) {
        if (/Early preliminary/i.test(c[0])) seg = "early"; else if (/Preliminary/i.test(c[0])) seg = "prelims"; else if (/Main card/i.test(c[0])) seg = "main";
        return;
      }
      if (c.length < 4 || c[0] === "Weight class" || !/^(vs\.|def\.)/.test(c[2] || "")) return;
      const side = (s) => { const champ = /\((c|ic)\)/.test(s); return { n: s.replace(/\s*\((c|ic)\)/g, "").trim(), champ }; };
      const a = side(c[1]), b = side(c[3]);
      const wRaw = c[0].replace(/\s*\(.*\)/, "").trim();
      const f = { s: seg, w: WEIGHT[wRaw] || c[0], a, b };
      f.wn = wRaw;
      if (a.champ || b.champ) f.title = `Titre ${wRaw}`;
      if (/^def\./.test(c[2]) && c[4]) {
        const m = method(c[4]);
        f.res = { w: /^Match nul/.test(m) ? "draw" : /^No contest/.test(m) ? "nc" : "a", method: m, round: +c[5] || 0, time: c[6] || "" };
      }
      fights.push(f);
    });
  });
  if (!fights.length) return { title, info, fights };
  const main = fights.filter((f) => f.s === "main");
  fights.forEach((f) => {
    if (!f.title && PFL_TITLES.has(pairKey(f.a.n, f.b.n))) f.title = `Titre ${f.wn}`;
    f.r = f.title || (f === main[0] && !/^PFL/.test(name)) ? 5 : 3;
  });
  return { title, info, fights };
}

/* ---------- Programme principal ---------- */
const overrides = JSON.parse(await readFile(new URL("../data/overrides.json", import.meta.url), "utf8").catch(() => "{}"));
const roster = await fighters();
const list = (await eventList()).filter((e) => {
  const t = Date.parse(e.date);
  return t > now - 30 * DAY && t < now + 120 * DAY;
}).sort((a, b) => a.date.localeCompare(b.date));
console.log(`Soirées retenues : ${list.map((e) => e.name).join(" / ")}`);

const events = [], agenda = [];
for (const e of list) {
  const p = await eventPage(e.name);
  const num = e.name.match(/^UFC (\d+)\b/);
  const vs = e.name.match(/:\s*(.+?)\s+vs\.?\s+(.+)$/);
  const cityFull = p?.info.City || "", venue = p?.info.Venue || "";
  const parts = cityFull.split(",").map((s) => s.trim());
  const city = (parts[0] || "").replace(/ City$/, "").replace(/^(Enterprise|Paradise|Winchester)$/, "Las Vegas").replace(/^Décines-Charpieu$/, "Lyon").replace(/^Moon Township$/, "Pittsburgh").replace(/^Elmont$/, "New York"), country = parts[parts.length - 1] || "";
  const date = (p?.info.Date || "").match(/\((\d{4}-\d{2}-\d{2})\)/)?.[1] || e.date;
  const pfl = e.org === "PFL";
  const label = pfl ? e.name.split(":")[0] : num ? `UFC ${num[1]}` : "UFC Fight Night";
  if (!p || !p.fights.length || !vs) {
    agenda.push({ sport: "mma", date, name: vs ? `${vs[1]} vs ${vs[2]}` : "Affiche à annoncer", org: `${pfl ? "PFL" : label}${city ? " · " + city : ""}` });
    continue;
  }
  const slug = [vs[1], vs[2]].map((s) => s.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")).join("-");
  const id = num ? `ufc${num[1]}` : `${pfl ? "pfl" : "fn"}-${slug}`;
  const ov = overrides[id] || {};
  const tz = ov.tz || tzFor(cityFull, country);
  const hasEarly = p.fights.some((f) => f.s === "early");
  let segs, tbc = false;
  if (ov.segs) segs = ov.segs;
  else if (/United States/.test(country) || tz.startsWith("America/")) {
    // Horaires habituels aux États-Unis (heure de l'Est), à confirmer pour la PFL
    if (pfl) tbc = true;
    const H = pfl ? { early: "17:00", prelims: "18:00", main: "21:00" } : num ? { early: "17:00", prelims: "19:00", main: "21:00" } : { early: "16:00", prelims: "17:00", main: "20:00" };
    segs = (hasEarly ? ["early", "prelims", "main"] : ["prelims", "main"]).map((k) => ({ k, t: localToUtc(date, H[k], "America/New_York") }));
  } else {
    // Hors États-Unis : main card vers 21h locales, à confirmer
    const H = { early: "17:00", prelims: num ? "19:00" : "18:00", main: pfl ? "20:00" : "21:00" };
    segs = (hasEarly ? ["early", "prelims", "main"] : ["prelims", "main"]).map((k) => ({ k, t: localToUtc(date, H[k], tz) }));
    tbc = true;
  }
  if (ov.tbc !== undefined) tbc = ov.tbc;
  for (const [n, nat] of Object.entries(overrides._nat || {})) roster[n] = { ...(roster[n] || {}), nat };
  for (const f of p.fights) for (const x of [f.a, f.b]) if (!roster[x.n]?.nat && x.n !== "TBA") { const r = await lookup(x.n, roster); if (r) roster[x.n] = { ...roster[x.n], ...r, nat: r.nat || roster[x.n]?.nat || "", rec: roster[x.n]?.rec || r.rec }; }
  const person = (x, res, mine) => {
    const r = roster[x.n];
    let rec = r?.rec ? [...r.rec] : null;
    // Soirée passée : on remet le record d'avant le combat (évite de deviner le résultat)
    if (rec && res) {
      if (res.w === "draw") rec[2] = Math.max(0, rec[2] - 1);
      else if (res.w === "a") rec[mine ? 0 : 1] = Math.max(0, rec[mine ? 0 : 1] - 1);
    }
    const o = { n: x.n };
    if (rec) o.rec = rec.join("-");
    if (r?.nat) o.nat = r.nat;
    if (r?.nat === "FRA") o.fr = 1;
    if (x.champ) o.champ = 1;
    return o;
  };
  const fights = p.fights.map((f) => {
    const o = { s: f.s, w: f.w, r: f.r, a: person(f.a, f.res, true), b: person(f.b, f.res, false) };
    const t = (ov.titles || {})[f.a.n] || f.title;
    if (t) o.title = t;
    if (f.res) o.res = f.res;
    return o;
  });
  events.push({
    id, org: pfl ? "PFL" : "UFC", name: label, a: vs[1].trim().replace(/ \d+$/, ""), b: vs[2].trim().replace(/ \d+$/, ""),
    venue, city, ...(COUNTRY[country] ? { ctry: COUNTRY[country] } : {}), tz, ...(tbc ? { tbc: 1 } : {}), segs, fights, wiki: p.title,
  });
  console.log(`  ${id} : ${fights.length} combats, ${fights.filter((f) => f.res).length} résultats`);
}

/* ---------- Boxe et MMA français : data/presse.json, tenu à jour par la tâche programmée (veille presse) ---------- */
const presse = JSON.parse(await readFile(new URL("../data/presse.json", import.meta.url), "utf8").catch(() => "{}"));
for (const e of presse.events || []) {
  const t = Date.parse(e.segs?.[0]?.t || "");
  if (!(t > now - 30 * DAY && t < now + 120 * DAY)) continue;
  for (const f of e.fights) for (const x of [f.a, f.b]) if (x.nat === "FRA") x.fr = 1;
  const { sources, ...ev } = e;
  events.push(ev);
}
for (const a of presse.agenda || []) if (Date.parse(a.date) > now - DAY && Date.parse(a.date) < now + 180 * DAY) agenda.push(a);
events.sort((a, b) => Date.parse(a.segs[0].t) - Date.parse(b.segs[0].t));
console.log(`Presse : ${(presse.events || []).length} soirées, ${(presse.agenda || []).length} à l'agenda`);

await writeFile(cacheFile, JSON.stringify(cache, null, 1));
const data = { updated: new Date().toISOString(), source: "Wikipédia (en), licence CC BY-SA, et veille presse", presse: !!presse.events, events, agenda };
await mkdir(new URL("../data/", import.meta.url), { recursive: true });
const file = new URL("../data/events.json", import.meta.url);
const old = await readFile(file, "utf8").catch(() => "");
const strip = (s) => s.replace(/"updated": ?"[^"]*",?/, "");
const next = JSON.stringify(data, null, 1);
if (strip(old) === strip(next)) console.log("Aucun changement.");
else { await writeFile(file, next); console.log(`data/events.json écrit (${events.length} soirées détaillées, ${agenda.length} à l'agenda).`); }
