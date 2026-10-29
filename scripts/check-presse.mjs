// Vérifie data/presse.json avant publication : node scripts/check-presse.mjs
import { readFile } from "node:fs/promises";
const d = JSON.parse(await readFile(new URL("../data/presse.json", import.meta.url), "utf8"));
const err = [];
const iso = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/.test(s) && !isNaN(Date.parse(s));
const ids = new Set();
for (const e of d.events || []) {
  const w = `[${e.id}]`;
  if (!/^[a-z0-9-]+$/.test(e.id || "")) err.push(`${w} id invalide (minuscules, chiffres, tirets)`);
  if (ids.has(e.id)) err.push(`${w} id en double`); ids.add(e.id);
  if (!["boxe", "mma"].includes(e.sport)) err.push(`${w} sport doit être "boxe" ou "mma"`);
  for (const k of ["org", "name", "a", "b", "city", "tz"]) if (!e[k]) err.push(`${w} champ manquant : ${k}`);
  try { new Intl.DateTimeFormat("fr", { timeZone: e.tz }); } catch { err.push(`${w} fuseau inconnu : ${e.tz}`); }
  if (!Array.isArray(e.segs) || !e.segs.length || e.segs.some((s) => !["early", "prelims", "main"].includes(s.k) || !iso(s.t))) err.push(`${w} segs invalides (k = prelims/main, t = date ISO UTC en Z)`);
  if (!Array.isArray(e.sources) || e.sources.length < 1) err.push(`${w} sources manquantes`);
  if (!Array.isArray(e.fights) || !e.fights.length) err.push(`${w} aucun combat`);
  for (const f of e.fights || []) {
    const fw = `${w} ${f.a?.n} vs ${f.b?.n}`;
    if (!e.segs?.some((s) => s.k === f.s)) err.push(`${fw} : segment "${f.s}" absent de segs`);
    if (!f.a?.n || !f.b?.n) err.push(`${fw} : noms manquants`);
    if (!Number.isInteger(f.r) || f.r < 1 || f.r > 12) err.push(`${fw} : r (rounds) doit être un entier 1-12`);
    if (f.t && !iso(f.t)) err.push(`${fw} : t doit être une date ISO UTC en Z`);
    for (const x of [f.a, f.b]) if (x?.nat && !/^[A-Z]{3}$/.test(x.nat)) err.push(`${fw} : nat doit être un code à 3 lettres`);
    if (f.res && !["a", "draw", "nc"].includes(f.res.w)) err.push(`${fw} : res.w doit être "a" (a gagne), "draw" ou "nc"`);
  }
  if (e.fights?.[0] && e.fights[0].s !== "main") err.push(`${w} le premier combat doit être le combat principal (s: "main")`);
}
for (const a of d.agenda || []) if (!a.date || !/^\d{4}-\d{2}-\d{2}$/.test(a.date) || !a.name || !a.org || !["boxe", "mma"].includes(a.sport)) err.push(`agenda invalide : ${JSON.stringify(a)}`);
if (err.length) { console.log("ERREURS :\n- " + err.join("\n- ")); process.exit(1); }
console.log(`OK : ${(d.events || []).length} soirées, ${(d.agenda || []).length} entrées d'agenda.`);
