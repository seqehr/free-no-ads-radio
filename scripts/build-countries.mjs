// Builds one static, indexable page per country (/radio/<slug>/) from the Radio Browser API,
// fills the "Radio by country" hub in index.html, and rewrites sitemap.xml.
// Runs weekly in GitHub Actions. No dependencies (Node 20+).
//
//   node scripts/build-countries.mjs            # live API
//   FIXTURE=path.json node scripts/build-countries.mjs   # offline test data

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE = "https://seqehr.github.io/free-no-ads-radio";
const BASE = "/free-no-ads-radio";
const MAX_COUNTRIES = Number(process.env.MAX_COUNTRIES || 40);
const MIN_STATIONS = Number(process.env.MIN_STATIONS || 25);   // fewer playable stations → no page
const LIST_SIZE = 60;                                           // stations rendered into each page
const MIRRORS = ["https://de1.api.radio-browser.info", "https://fi1.api.radio-browser.info", "https://de2.api.radio-browser.info"];
const TODAY = new Date().toISOString().slice(0, 10);

// Names people actually search for, where ICU's English name differs
const NAME_OVERRIDES = { TR: "Turkey", US: "USA", GB: "UK", CZ: "Czech Republic", KR: "South Korea", RU: "Russia" };
const LONG_NAMES = { US: "the United States", GB: "the United Kingdom", NL: "the Netherlands", AE: "the United Arab Emirates", PH: "the Philippines" };
const GENERIC_TAGS = new Set(["radio", "fm", "am", "music", "station", "online", "live", "internet", "web", "webradio", "public", "local", "community", "various", "variety", "misc", "other", "stereo", "free", "mp3", "aac", "hd", "24/7", "news talk"]);

const fixture = process.env.FIXTURE ? JSON.parse(fs.readFileSync(process.env.FIXTURE, "utf8")) : null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(p) {
  if (fixture) {
    if (p.startsWith("/json/countries")) return fixture.countries;
    const cc = new URLSearchParams(p.split("?")[1]).get("countrycode");
    return fixture.stations[cc] || [];
  }
  let err;
  for (const m of MIRRORS) {
    try {
      const r = await fetch(m + p, { headers: { "User-Agent": "free-no-ads-radio/1.0 (+https://github.com/seqehr/free-no-ads-radio)" } });
      if (r.ok) return await r.json();
      err = new Error(`${m}${p} → ${r.status}`);
    } catch (e) { err = e; }
  }
  throw err;
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const flag = cc => String.fromCodePoint(...[...cc.toUpperCase()].map(c => 127397 + c.charCodeAt()));
const slugify = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const listJoin = a => a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a.at(-1);
const jsonForScript = v => JSON.stringify(v).replace(/</g, "\\u003c");
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

function between(src, name, content) {
  const a = `<!--seo:${name}-->`, b = `<!--/seo:${name}-->`;
  const i = src.indexOf(a), j = src.indexOf(b);
  if (i < 0 || j < 0) throw new Error(`marker ${name} missing in template`);
  return src.slice(0, i + a.length) + content + src.slice(j);
}

function topCounts(values, n, exclude = new Set()) {
  const c = new Map();
  for (const v of values) { const k = v.trim(); if (!k || exclude.has(k.toLowerCase())) continue; c.set(k, (c.get(k) || 0) + 1); }
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}
const titleCase = s => s.replace(/\b\w/g, c => c.toUpperCase());

function stationLi(s, i) {
  const tags = (s.tags || "").split(",").filter(Boolean).slice(0, 3).join(" · ");
  const logo = s.favicon && s.favicon.startsWith("https") ? `<img src="${esc(s.favicon)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
  return `<li data-i="${i}"><div class="logo">${esc((s.name || "?").trim()[0])}${logo}</div>` +
    `<div class="info"><div class="name">${esc(s.name.trim())}</div><div class="meta">${esc(tags || s.state || "Live radio")}</div></div>` +
    (s.bitrate ? `<span class="br">${s.bitrate}k</span>` : "") +
    `<button class="fav" data-f="${i}" aria-label="Add to favorites">☆</button></li>`;
}

function hubHtml(pages, currentCc) {
  const items = [...pages].sort((a, b) => a.name.localeCompare(b.name)).map(p =>
    `<li><a href="${BASE}/radio/${p.slug}/"${p.cc === currentCc ? ' aria-current="page"' : ""}>${flag(p.cc)} ${esc(p.name)} radio</a></li>`).join("");
  return `\n  <nav class="hub" aria-labelledby="hub-h">\n    <h2 id="hub-h">Radio by country</h2>\n    <ul>${items}</ul>\n  </nav>\n  `;
}

function countryPage(tpl, p, pages) {
  const { cc, name, slug, stations, total } = p;
  const longName = LONG_NAMES[cc] || name;
  const url = `${SITE}/radio/${slug}/`;
  const top = stations.slice(0, 10);
  const top3 = top.slice(0, 3).map(s => s.name.trim());
  const nameWords = new Set([name.toLowerCase(), (regionNames.of(cc) || "").toLowerCase(), cc.toLowerCase()]);
  const genres = topCounts(stations.flatMap(s => (s.tags || "").toLowerCase().split(",")), 6, new Set([...GENERIC_TAGS, ...nameWords])).map(titleCase);
  const regions = topCounts(stations.map(s => s.state || ""), 5);
  const langs = topCounts(stations.flatMap(s => (s.language || "").split(",")), 3).map(titleCase);
  const count = total.toLocaleString("en");

  const title = `${name} Radio Online Free – ${count} Live Stations, No Ads`;
  const desc = `Listen to ${count} live radio stations from ${longName} online for free, with no ads: ${listJoin(top3)} and more. Works in any browser and on your phone.`;

  const faq = [
    [`What are the most popular radio stations in ${longName}?`, `Right now the most listened ${name} stations here are ${listJoin(top.slice(0, 5).map(s => s.name.trim()))}. The list is ordered by listener clicks and updated every week.`],
    [`Can I listen to ${name} radio from abroad?`, `Yes. These stations stream over the internet, so you can play them from any country in your browser, with no app and no account.`],
    [`Is it free and without ads?`, `The player itself is free and shows no ads. Some stations air their own commercials on the broadcast, which no app can remove.`],
  ];

  const ld = {
    "@context": "https://schema.org", "@graph": [
      { "@type": "WebPage", "@id": url, url, name: title, description: desc, inLanguage: "en", isPartOf: { "@type": "WebSite", name: "Free No-Ads Radio", url: SITE + "/" }, dateModified: TODAY },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Free No-Ads Radio", item: SITE + "/" },
        { "@type": "ListItem", position: 2, name: `${name} radio`, item: url }] },
      { "@type": "ItemList", name: `Popular radio stations in ${longName}`, itemListElement: top.map((s, i) => ({
        "@type": "ListItem", position: i + 1,
        item: { "@type": "RadioStation", name: s.name.trim(), ...(s.homepage?.startsWith("http") ? { url: s.homepage } : {}), address: { "@type": "PostalAddress", addressCountry: cc, ...(s.state ? { addressRegion: s.state } : {}) } } })) },
      { "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ]
  };

  const head = `
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Free No-Ads Radio">
<meta property="og:title" content="${esc(`${name} Radio Online – Free, No Ads`)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(`${name} Radio Online – Free, No Ads`)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}/og.png">
<link rel="manifest" href="${BASE}/manifest.json">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="No-Ads Radio">
<meta name="theme-color" content="#14171c">
<script type="application/ld+json">${jsonForScript(ld)}</script>
`;

  const hero = `
      <p class="crumbs"><a href="${BASE}/">Free No-Ads Radio</a> › ${esc(name)} radio</p>
      <h1>${flag(cc)} ${esc(name)} Radio Online<span>.</span></h1>
      <p class="tagline">Listen to ${count} live ${esc(name)} radio stations for free. No ads, no sign-up.</p>
`;

  const about = `
  <section class="about" aria-labelledby="about-h">
    <h2 id="about-h">Live radio from ${esc(longName)}</h2>
    <p>This page lists ${count} radio stations from ${esc(longName)} that stream live over a secure connection, so they play in any modern browser and on iPhone and Android. Stations are ordered by how often listeners play them, and the list is refreshed every week.</p>
    <h2>Most popular ${esc(name)} radio stations</h2>
    <ol class="toplist">${top.map(s => `<li><strong>${esc(s.name.trim())}</strong>${s.state ? ` – ${esc(s.state)}` : ""}${(s.tags || "").split(",").filter(Boolean).length ? ` · ${esc((s.tags || "").split(",").filter(Boolean).slice(0, 2).join(", "))}` : ""}</li>`).join("")}</ol>
    ${genres.length ? `<p>Popular formats in ${esc(longName)} include ${esc(listJoin(genres.map(g => g.toLowerCase())))}.${regions.length ? ` Many stations broadcast from ${esc(listJoin(regions))}.` : ""}${langs.length ? ` Main broadcast language${langs.length > 1 ? "s" : ""}: ${esc(listJoin(langs))}.` : ""}</p>` : ""}
    <h2>Questions</h2>
    ${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n    ")}
  </section>
`;

  const preset = `<script>window.PRESET=${jsonForScript({ cc, name, stations: stations.map(s => ({
    stationuuid: s.stationuuid, name: s.name, url_resolved: s.url_resolved, favicon: s.favicon, tags: s.tags,
    country: s.country, countrycode: s.countrycode, bitrate: s.bitrate, state: s.state })) })}</script>`;

  let html = tpl;
  html = between(html, "head", head);
  html = between(html, "hero", hero);
  html = between(html, "list", stations.map(stationLi).join(""));
  html = between(html, "about", about);
  html = between(html, "hub", hubHtml(pages, cc));
  html = between(html, "preset", preset);
  return html;
}

async function main() {
  const indexPath = path.join(ROOT, "index.html");
  const tpl = fs.readFileSync(indexPath, "utf8");

  const byCc = {};
  for (const c of await api("/json/countries?hidebroken=true")) {
    const cc = (c.iso_3166_1 || "").toUpperCase();
    if (cc.length === 2) byCc[cc] = (byCc[cc] || 0) + c.stationcount;
  }
  const candidates = Object.entries(byCc).sort((a, b) => b[1] - a[1]).slice(0, MAX_COUNTRIES * 2).map(([cc]) => cc);

  const pages = [];
  for (const cc of candidates) {
    if (pages.length >= MAX_COUNTRIES) break;
    const raw = await api(`/json/stations/search?countrycode=${cc}&hidebroken=true&order=clickcount&reverse=true&limit=400`);
    const seen = new Set();
    const ok = raw.filter(s => (s.url_resolved || "").startsWith("https://")).filter(s => {
      const k = (s.name || "").trim().toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
    if (ok.length < MIN_STATIONS) { console.log(`skip ${cc}: ${ok.length} playable stations`); continue; }
    const name = NAME_OVERRIDES[cc] || regionNames.of(cc) || cc;
    pages.push({ cc, name, slug: slugify(name), stations: ok.slice(0, LIST_SIZE), total: ok.length });
    console.log(`page ${cc} ${name}: ${ok.length} stations`);
    if (!fixture) await sleep(400);
  }
  if (pages.length < 5) throw new Error(`only ${pages.length} countries qualified – refusing to overwrite the site`);

  // Fresh /radio/ folder so countries that drop below the bar disappear
  const outDir = path.join(ROOT, "radio");
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const p of pages) {
    const dir = path.join(outDir, p.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), countryPage(tpl, p, pages));
  }

  fs.writeFileSync(indexPath, between(tpl, "hub", hubHtml(pages, null)));

  const urls = [{ loc: `${SITE}/`, pr: "1.0" }, ...pages.map(p => ({ loc: `${SITE}/radio/${p.slug}/`, pr: "0.8" }))];
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${TODAY}</lastmod><changefreq>weekly</changefreq><priority>${u.pr}</priority></url>`).join("\n") +
    `\n</urlset>\n`);

  console.log(`built ${pages.length} country pages`);
}

main().catch(e => { console.error(e); process.exit(1); });
