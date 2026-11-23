const args = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  })
);
const start = Math.max(0, Number(args.start || 0));
const count = Math.min(30, Math.max(1, Number(args.count || 10)));
const base = 'https://www.maff.go.jp/e/policies/market/k_ryouri/search_menu';
const listUrl = page => page === 1
  ? `${base}/cat/alltype/index.html`
  : `${base}/cat/alltype/page/${page}/index.html`;
const decode = value => value
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

async function get(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'FoodLight recipe source audit/1.0' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function translate(text, target) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', 'en');
    url.searchParams.set('tl', target);
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', text);
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      await pause(250);
      return data?.[0]?.map(part => part?.[0]).join('') || text;
    }
    if (response.status !== 429 || attempt === 3) throw new Error(`translation ${response.status}`);
    await pause(1000 * (attempt + 1));
  }
  return text;
}

function equipmentFrom(method) {
  const lower = method.toLowerCase();
  const equipment = [];
  if (/oven|bake|roast/.test(lower)) equipment.push('oven');
  if (/frying pan|skillet|griddle|pan-fry|stir-fry/.test(lower)) equipment.push('frying_pan');
  if (/pot|boil|simmer|steam|stew/.test(lower)) equipment.push('saucepan');
  return equipment;
}

function parseList(html) {
  return [...html.matchAll(/<article class="row"><a href="\.\.\/\.\.\/(\d+)\/index\.html">[\s\S]*?<img[^>]+alt="([^"]+)"/g)]
    .map(([, id, title]) => ({ id, title: decode(title) }));
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await mapper(items[index]);
    }
  }));
  return output;
}

const firstPage = Math.floor(start / 30) + 1;
const lastPage = Math.floor((start + count - 1) / 30) + 1;
const listPages = await Promise.all(
  Array.from({ length: lastPage - firstPage + 1 }, (_, offset) => get(listUrl(firstPage + offset)))
);
const listed = listPages.flatMap(parseList);
const offsetInFirstPage = start % 30;
const selected = listed.slice(offsetInFirstPage, offsetInFirstPage + count);

const recipes = await mapLimit(selected, 1, async item => {
  const source = `${base}/${item.id}/index.html`;
  const html = await get(source);
  const title = decode(html.match(/<h2 class="tit06"><span class="name">([\s\S]*?)<\/span>/)?.[1] || item.title);
  const prefecture = decode(html.match(/<h2 class="tit06 -prefecture">[\s\S]*?<span class="([^"]+)">([^<]+)<\/span> Prefecture/)?.[2] || '');
  const ingredients = decode(html.match(/Main ingredients used[\s\S]*?<p class="mt10">([\s\S]*?)<\/p>/)?.[1] || '');
  const method = decode(html.match(/<div class="howto__wrap">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] || '');
  const zhTitle = await translate(title, 'zh-CN');
  const jaTitle = await translate(title, 'ja');
  const koTitle = await translate(title, 'ko');
  const zhIngredients = await translate(ingredients || title, 'zh-CN');
  const jaIngredients = await translate(ingredients || title, 'ja');
  const koIngredients = await translate(ingredients || title, 'ko');
  const equipment = equipmentFrom(method);
  return {
    id: `japan-maff-${item.id}`,
    cuisine: 'japan',
    sourceStatus: 'source-parsed',
    source,
    sourceEvidence: { title, prefecture, ingredients, methodKeywords: equipment },
    translations: {
      en: { title, copy: `Regional ${prefecture ? `${prefecture} ` : ''}dish; check the source method before cooking.` },
      zh: { title: zhTitle, copy: '地方料理候选；烹饪前请查看来源中的做法。' },
      ja: { title: jaTitle, copy: '郷土料理の候補です。調理前に出典の作り方を確認してください。' },
      ko: { title: koTitle, copy: '향토 요리 후보입니다. 조리 전 출처의 방법을 확인하세요.' }
    },
    ingredients: [{
      label: ingredients || title,
      labels: { en: ingredients || title, zh: zhIngredients, ja: jaIngredients, ko: koIngredients },
      names: [ingredients || title, zhIngredients, jaIngredients, koIngredients]
    }],
    seasonings: [],
    equipment,
    equipmentInference: equipment.length ? 'method-keywords' : 'not-yet-classified'
  };
});

console.log(JSON.stringify({ source: 'MAFF Our Regional Cuisines', start, count, recipes }, null, 2));
