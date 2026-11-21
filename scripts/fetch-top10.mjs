import fs from "node:fs";

const SOLVER = process.env.FLARESOLVERR_URL || "http://127.0.0.1:8191/v1";
const OUTPUT = "top10-brasil.json";
const providers = {
  prime: "amazon-prime",
  max: "hbo-max",
  disney: "disney-plus",
  paramount: "paramount-plus",
  apple: "apple-tv"
};

function decode(text) {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function section(html, heading) {
  const h3 = /<h3\b[^>]*>([\s\S]*?)<\/h3>/gi;
  let match;
  while ((match = h3.exec(html))) {
    if (decode(match[1]).toLowerCase() !== heading.toLowerCase()) continue;
    const start = h3.lastIndex;
    const rest = html.slice(start);
    const next = rest.search(/<h3\b|<\/section|<\/main/i);
    return next < 0 ? rest : rest.slice(0, next);
  }
  return "";
}

function titles(html, heading) {
  const block = section(html, heading);
  if (!block) return [];
  const anchors = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  const out = [];
  let match;
  while ((match = anchors.exec(block)) && out.length < 10) {
    const attrs = match[1];
    if (!attrs.includes("hover:underline")) continue;
    if (!/href=["']\/title\//i.test(attrs)) continue;
    const title = decode(match[2]);
    if (title) out.push({ rank: out.length + 1, title });
  }
  return out;
}

async function fetchPage(url) {
  const response = await fetch(SOLVER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd: "request.get", url, maxTimeout: 60000 })
  });
  const data = await response.json();
  if (!response.ok || !data.solution || !data.solution.response) {
    throw new Error(`FlareSolverr falhou para ${url}: ${data.message || response.status}`);
  }
  return data.solution.response;
}

function loadPrevious() {
  try {
    return JSON.parse(fs.readFileSync(OUTPUT, "utf8"));
  } catch {
    return { updated: null, providers: {} };
  }
}

const previous = loadPrevious();
const result = {
  updated: new Date().toISOString(),
  source: "FlixPatrol via FlareSolverr",
  providers: { ...(previous.providers || {}) }
};

let ok = 0;
for (const [key, slug] of Object.entries(providers)) {
  const url = `https://flixpatrol.com/top10/${slug}/brazil/`;
  try {
    const html = await fetchPage(url);
    const series = titles(html, "TOP 10 TV Shows");
    const movies = titles(html, "TOP 10 Movies");
    if (series.length || movies.length) {
      result.providers[key] = { series, movies };
      ok++;
      console.log(`${key}: ${series.length} séries, ${movies.length} filmes`);
    } else {
      console.log(`${key}: nenhuma seção encontrada`);
    }
  } catch (error) {
    console.error(`${key}: ${error.message}`);
  }
}

if (ok === 0) {
  console.error("Nenhum provedor atualizado; mantendo o JSON anterior.");
  process.exit(1);
}

fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2) + "\n", "utf8");
console.log(`Gravado ${OUTPUT} com ${ok} provedor(es).`);
