import fs from 'node:fs';
import vm from 'node:vm';

const LOCALES = ['en', 'zh', 'ja', 'ko'];
const script = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .split('<script type="module">')[1]?.split('</script>')[0] || '';
const start = script.indexOf('const seasons=');
const end = script.indexOf('    const cuisineLabels=');

if (start < 0 || end < 0) throw new Error('Could not locate the recipe catalog.');

const context = {};
vm.runInNewContext(script.slice(start, end).replace('const recipes=', 'globalThis.recipes='), context);
const recipes = context.recipes.filter(recipe => recipe.sourceStatus && recipe.sourceStatus !== 'legacy-unverified');
const expectedWriting = {
  en: /[A-Za-z]{2}/,
  zh: /[\u4e00-\u9fff]/,
  ja: /[ぁ-んァ-ン]/,
  ko: /[\uac00-\ud7af]/
};
const problems = [];
const missingMethods = [];

for (const recipe of recipes) {
  for (const locale of LOCALES) {
    const translation = recipe.translations?.[locale];
    for (const field of ['title', 'copy']) {
      if (!translation?.[field]) problems.push(`${recipe.id}: ${locale} ${field} is missing`);
      else if (!(locale === 'ja' && field === 'title' ? /[\u4e00-\u9fffぁ-んァ-ン]/ : expectedWriting[locale]).test(translation[field])) {
        problems.push(`${recipe.id}: ${locale} ${field} lacks expected writing`);
      }
    }
    if (locale !== 'en' && translation?.copy === recipe.translations?.en?.copy) {
      problems.push(`${recipe.id}: ${locale} copy repeats English`);
    }
    const steps = recipe.steps?.[locale];
    if (recipe.steps && (!Array.isArray(steps) || steps.length < 2 || steps.some(step => !expectedWriting[locale].test(step)))) {
      problems.push(`${recipe.id}: ${locale} method is incomplete or in the wrong language`);
    }
  }
  if (!recipe.steps) missingMethods.push(recipe.id);
}

if (problems.length) {
  console.error(`Recipe language audit failed: ${problems.length} issue(s).`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`Recipe language audit passed: ${recipes.length} source-reviewed recipes have readable four-language titles and notes.`);
}

console.log(`${recipes.length - missingMethods.length}/${recipes.length} source-reviewed recipes include four-language methods.`);
if (missingMethods.length) console.log(`Method backlog (${missingMethods.length}): ${missingMethods.join(', ')}`);

if (process.argv.includes('--strict-methods') && missingMethods.length) {
  console.error('Recipe method audit failed: source-reviewed recipes still lack methods.');
  process.exitCode = 1;
}
