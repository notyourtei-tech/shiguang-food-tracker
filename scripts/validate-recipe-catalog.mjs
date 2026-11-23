import fs from 'node:fs';
import vm from 'node:vm';

// China and Japan retain the 500-recipe expansion target. The current product
// brief prioritizes Japan and asks for a focused popular set (about 100 total)
// for Korean and Western food, represented here as 50 source-verified entries
// for each cuisine.
const TARGETS = { china: 500, korea: 50, japan: 500, western: 50 };
const LOCALES = ['en', 'zh', 'ja', 'ko'];
const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = source.split('<script type="module">')[1]?.split('</script>')[0] || '';
const start = script.indexOf('const seasons=');
const end = script.indexOf('    const cuisineLabels=');

if (start < 0 || end < 0) {
  console.error('Could not locate the recipe catalog in index.html.');
  process.exit(1);
}

const catalogCode = script
  .slice(start, end)
  .replace('const recipes=', 'globalThis.recipes=');
const context = {};
vm.runInNewContext(catalogCode, context);
const recipes = context.recipes;

if (!Array.isArray(recipes)) {
  console.error('Recipe catalog did not evaluate to an array.');
  process.exit(1);
}

const errors = [];
const verified = recipes.filter(recipe => recipe.sourceStatus === 'verified');
const catalogued = recipes.filter(recipe => recipe.sourceStatus && recipe.sourceStatus !== 'legacy-unverified');
const counts = Object.fromEntries(Object.keys(TARGETS).map(cuisine => [cuisine, 0]));
const methods = Object.fromEntries(Object.keys(TARGETS).map(cuisine => [cuisine, 0]));
const ids = new Set();
const titles = Object.fromEntries(LOCALES.map(locale => [locale, new Set()]));

for (const recipe of catalogued) {
  if (!TARGETS[recipe.cuisine]) errors.push(`${recipe.id || '(missing id)'}: unsupported cuisine`);
  if (!recipe.id) errors.push('catalogued recipe is missing an id');
  else if (ids.has(recipe.id)) errors.push(`${recipe.id}: duplicate id`);
  else ids.add(recipe.id);
  if (!/^https:\/\//.test(recipe.source || '')) errors.push(`${recipe.id}: catalogued recipe lacks an HTTPS source`);
  if (!Array.isArray(recipe.ingredients) || !recipe.ingredients.length) errors.push(`${recipe.id}: missing ingredients`);
  if (!Array.isArray(recipe.seasonings) || !Array.isArray(recipe.equipment)) errors.push(`${recipe.id}: missing seasonings or equipment`);
  const hasFourLanguageMethod = LOCALES.every(locale => Array.isArray(recipe.steps?.[locale]) && recipe.steps[locale].length);
  if (hasFourLanguageMethod) methods[recipe.cuisine] = (methods[recipe.cuisine] || 0) + 1;

  for (const locale of LOCALES) {
    const translation = recipe.translations?.[locale];
    if (!translation?.title || !translation?.copy) {
      errors.push(`${recipe.id}: missing ${locale} title or inventory note`);
      continue;
    }
    const titleKey = translation.title.trim().toLocaleLowerCase(locale);
    if (titles[locale].has(titleKey)) errors.push(`${recipe.id}: duplicate ${locale} title “${translation.title}”`);
    titles[locale].add(titleKey);
  }

  for (const ingredient of recipe.ingredients || []) {
    if (!Array.isArray(ingredient.names) || !ingredient.names.length) errors.push(`${recipe.id}: ingredient lacks matching names`);
    for (const locale of LOCALES) {
      if (!ingredient.labels?.[locale]) errors.push(`${recipe.id}: ingredient lacks ${locale} label`);
    }
  }
}

for (const recipe of verified) counts[recipe.cuisine] = (counts[recipe.cuisine] || 0) + 1;

for (const [cuisine, target] of Object.entries(TARGETS)) {
  console.log(`${cuisine}: ${counts[cuisine] || 0} source-verified, fully translated recipes; ${methods[cuisine] || 0} include four-language methods / target ${target}`);
}
console.log(`source-reviewed, not yet verified: ${catalogued.length - verified.length}`);
console.log(`legacy retained but not counted: ${recipes.length - catalogued.length}`);

if (errors.length) {
  console.error(`Catalog validation failed: ${errors.length} structural issue(s).`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Catalog structural validation passed.');
}

if (process.argv.includes('--strict')) {
  const shortfalls = Object.entries(TARGETS)
    .filter(([cuisine, target]) => (counts[cuisine] || 0) < target)
    .map(([cuisine, target]) => `${cuisine} needs ${target - (counts[cuisine] || 0)} more`);
  if (shortfalls.length) {
    console.error(`Catalog target validation failed: ${shortfalls.join('; ')}.`);
    process.exitCode = 1;
  } else {
    console.log('Catalog target validation passed.');
  }
}
