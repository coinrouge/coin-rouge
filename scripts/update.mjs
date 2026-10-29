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
const WEIGHT = {
  "Heavyweight": "HW", "Light Heavyweight": "LHW", "Middleweight": "MW", "Welterweight": "WW", "Lightweight": "LW",
  "Featherweight": "FW", "Bantamweight": "BW", "Flyweight": "FLW", "Women's Featherweight": "WFW",
  "Women's Bantamweight": "WBW", "Women's Flyweight": "WFLW", "Women's Strawweight": "WSW",
};
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
  Norway: "NOR", Denmark: "DEN", Finland: "FIN", Switzerland: "SUI", Philippines: "PHI", Thailand: "THA", "Dagestan": "RUS",
};
function tzFor(city, country) {
  const c = `${city} ${country}`;
  if (/Las Vegas|Nevada|Glendale|Phoenix|Seattle|Sacramento|Los Angeles|Anaheim|San Diego/.test(c)) return "America/Los_Angeles";
  if (/Denver|Salt Lake/.test(c)) return "America/Denver";
  if (/Chicago|Nashville|Houston|Dallas|San Antonio|Kansas|Oklahoma|Austin|Milwaukee/.test(c)) return "America/Chicago";
  if (/United States/.test(c)) return "America/New_York";
  const T = { Qatar: "Asia/Qatar", "United Arab Emirates": "Asia/Dubai", "Saudi Arabia": "Asia/Riyadh", Australia: "Australia/Sydney",
    France: "Europe/Paris", "United Kingdom": "Europe/London", England: "Europe/London", Canada: "America/Toronto", Brazil: "America/Sao_Paulo",
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
  const $ = await page("List of current UFC fighters");
  const map = {};
  if (!$) return map;
  $("table tr").each((_, tr) => {
    const td = $(tr).find("td");
    if (td.length < 8) return;
    const name = cell($, td[1]).replace(/\s*\((c|ic)\)$/, "");
    if (!name || /^\d/.test(name)) return;
    const f = $(td[0]);
    let country = f.find("a").attr("title") || f.find("img").attr("alt") || "";
    if (!country) { const src = f.find("img").attr("src") || ""; const m = src.match(/Flag_of_(?:the_)?([^./]+)/); if (m) country = decodeURIComponent(m[1]).replace(/_/g, " "); }
    const recm = cell($, td[td.length - 1]).match(/^(\d+)\s*[–-]\s*(\d+)(?:\s*[–-]\s*(\d+))?/);
    map[name] = { nat: COUNTRY[country] || country || "", rec: recm ? [+recm[1], +recm[2], +(recm[3] || 0)] : null };
  });
  console.log(`Combattants : ${Object.keys(map).length}`);
  return map;
}

/* ---------- Liste des soirées ---------- */
function parseDate(s) { const t = Date.parse(s + " 12:00 UTC"); return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10); }
async function eventList() {
  const out = [];
  for (const year of [2026, 2027]) {
    const $ = await page(`${year} in UFC`);
    if (!$) continue;
    $("table").each((_, t) => {
      const head = $(t).find("tr").first().find("th").map((_, th) => cell($, th)).get();
      const iEv = head.indexOf("Event"), iDate = head.indexOf("Date");
      if (iEv < 0 || iDate < 0) return;
      $(t).find("tr").slice(1).each((_, tr) => {
        const c = $(tr).find("td,th").map((_, x) => cell($, x)).get();
        const name = c[iEv], date = parseDate(c[iDate] || "");
        if (name && date && /^UFC/.test(name)) out.push({ name, date });
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
  fights.forEach((f) => { f.r = f.title || f === main[0] ? 5 : 3; });
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
  const city = (parts[0] || "").replace(/ City$/, "").replace(/^(Enterprise|Paradise|Winchester)$/, "Las Vegas"), country = parts[parts.length - 1] || "";
  const date = (p?.info.Date || "").match(/\((\d{4}-\d{2}-\d{2})\)/)?.[1] || e.date;
  if (!p || !p.fights.length || !vs) {
    agenda.push({ sport: "mma", date, name: vs ? `${vs[1]} vs ${vs[2]}` : "Affiche à annoncer", org: `${num ? `UFC ${num[1]}` : "UFC Fight Night"}${city ? " · " + city : ""}` });
    continue;
  }
  const id = num ? `ufc${num[1]}` : `fn-${[vs[1], vs[2]].map((s) => s.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")).join("-")}`;
  const ov = overrides[id] || {};
  const tz = ov.tz || tzFor(cityFull, country);
  const hasEarly = p.fights.some((f) => f.s === "early");
  let segs, tbc = false;
  if (ov.segs) segs = ov.segs;
  else if (/United States/.test(country) || tz.startsWith("America/")) {
    // Horaires habituels UFC aux États-Unis (heure de l'Est)
    const H = num ? { early: "17:00", prelims: "19:00", main: "21:00" } : { early: "16:00", prelims: "17:00", main: "20:00" };
    segs = (hasEarly ? ["early", "prelims", "main"] : ["prelims", "main"]).map((k) => ({ k, t: localToUtc(date, H[k], "America/New_York") }));
  } else {
    // Hors États-Unis : main card vers 21h locales, à confirmer
    const H = { early: "17:00", prelims: num ? "19:00" : "18:00", main: "21:00" };
    segs = (hasEarly ? ["early", "prelims", "main"] : ["prelims", "main"]).map((k) => ({ k, t: localToUtc(date, H[k], tz) }));
    tbc = true;
  }
  if (ov.tbc !== undefined) tbc = ov.tbc;
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
    id, name: num ? `UFC ${num[1]}` : "UFC Fight Night", a: vs[1].trim(), b: vs[2].trim(),
    venue, city, tz, ...(tbc ? { tbc: 1 } : {}), segs, fights, wiki: p.title,
  });
  console.log(`  ${id} : ${fights.length} combats, ${fights.filter((f) => f.res).length} résultats`);
}

const data = { updated: new Date().toISOString(), source: "Wikipédia (en), licence CC BY-SA", events, agenda };
await mkdir(new URL("../data/", import.meta.url), { recursive: true });
const file = new URL("../data/events.json", import.meta.url);
const old = await readFile(file, "utf8").catch(() => "");
const strip = (s) => s.replace(/"updated": ?"[^"]*",?/, "");
const next = JSON.stringify(data, null, 1);
if (strip(old) === strip(next)) console.log("Aucun changement.");
else { await writeFile(file, next); console.log(`data/events.json écrit (${events.length} soirées détaillées, ${agenda.length} à l'agenda).`); }
