import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const [markup = '', script = ''] = source.split('<script type="module">');
const problems = [];

const add = (kind, line, text) => problems.push({ kind, line, text: text.trim().slice(0, 120) });
const lineOf = index => source.slice(0, index).split('\n').length;

// Static markup must contain no user-facing fallback prose. This detects all
// four supported writing systems plus Latin text; CSS is removed first so
// selectors and declarations are not mistaken for content.
const markupWithoutStyle = markup.replace(/<style[\s\S]*?<\/style>/gi, '');
for (const match of markupWithoutStyle.matchAll(/>([^<\n]*[A-Za-z\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af][^<\n]*)</g)) {
  add('markup text', lineOf(match.index), match[1]);
}

// These are the user-facing dynamic APIs. Their message argument may not be a
// direct string: doing so makes it impossible to translate. `msg` has a target
// first, so it is checked separately from native browser dialogs.
for (const match of script.matchAll(/\b(?:alert|confirm|prompt|showAppError)\(\s*(['"`])([\s\S]*?)\1/g)) {
  const offset = source.indexOf(match[0], markup.length);
  add('fixed dynamic message', lineOf(offset), match[2]);
}
for (const match of script.matchAll(/\bmsg\(\s*[^,]+,\s*(['"`])([\s\S]*?)\1/g)) {
  const offset = source.indexOf(match[0], markup.length);
  add('fixed dynamic message', lineOf(offset), match[2]);
}

// Backend error messages are not localized by Supabase. They may not be
// interpolated into user-facing feedback, or a Japanese/Chinese/Korean user
// could receive an English service error. Console diagnostics are allowed.
for (const [index, line] of script.split('\n').entries()) {
  if (/\b(?:msg|showAppError|alert|confirm|prompt)\b/.test(line) && /\.message\b/.test(line) && !/console\.warn/.test(line)) {
    add('unlocalized service error', index + markup.split('\n').length + 1, line);
  }
}

// Every literal translation key used by the app must exist in all four
// dictionaries. Evaluating only the dictionary section avoids running app code.
const dictionaryStart = script.indexOf('const localeMeta=');
const dictionaryEnd = script.indexOf('    const seasons=');
if (dictionaryStart < 0 || dictionaryEnd < 0) {
  add('translation dictionary', 0, 'Could not locate the dictionary section.');
} else {
  try {
    const dictionaryCode = script
      .slice(dictionaryStart, dictionaryEnd)
      .replace('const I18N=', 'globalThis.I18N=');
    const context = { localStorage: { getItem: () => null, setItem: () => {} } };
    vm.runInNewContext(dictionaryCode, context);
    const keys = [...new Set(
      [...script.matchAll(/\bt\('([^']+)'/g)]
        .filter(match => !script.slice(match.index + match[0].length).trimStart().startsWith('+'))
        .map(match => match[1])
    )];
    for (const key of keys) {
      for (const locale of ['en', 'zh', 'ja', 'ko']) {
        if (!Object.prototype.hasOwnProperty.call(context.I18N?.[locale] || {}, key)) {
          add('missing translation', 0, `${locale}: ${key}`);
        }
      }
    }
    const dictionaryKeys = [...new Set(['en', 'zh', 'ja', 'ko'].flatMap(locale => Object.keys(context.I18N?.[locale] || {})))];
    const placeholders = value => [...String(value).matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort().join(',');
    for (const key of dictionaryKeys) {
      const baseline = context.I18N?.en?.[key];
      for (const locale of ['en', 'zh', 'ja', 'ko']) {
        const value = context.I18N?.[locale]?.[key];
        if (typeof value !== 'string' || !value.trim()) {
          add('incomplete translation dictionary', 0, `${locale}: ${key}`);
        } else if (placeholders(value) !== placeholders(baseline)) {
          add('translation placeholder mismatch', 0, `${locale}: ${key}`);
        }
      }
    }
    for (const locale of ['en', 'zh', 'ja', 'ko']) {
      for (const [key, value] of Object.entries(context.I18N?.[locale] || {})) {
        if (/Failed$|failed/i.test(key) && String(value).includes('{error}')) {
          add('unlocalized service error template', 0, `${locale}: ${key}`);
        }
      }
    }
  } catch (error) {
    add('translation dictionary', 0, error.message);
  }
}

// Categories, storage choices, appliances, seasonings, and cuisine filters
// are data-backed visible labels rather than I18N keys. Validate that every
// one has a non-empty entry for all four locales before it can reach users.
function evaluateMap(name) {
  const match = script.match(new RegExp(`const ${name}=([\\s\\S]*?);`));
  if (!match) {
    add('localized label map', 0, `Could not locate ${name}.`);
    return null;
  }
  try {
    const context = {};
    vm.runInNewContext(`globalThis.value=${match[1]}`, context);
    return context.value;
  } catch (error) {
    add('localized label map', 0, `${name}: ${error.message}`);
    return null;
  }
}

const localizedLabels = evaluateMap('localizedLabels');
for (const [group, labels] of Object.entries(localizedLabels || {})) {
  for (const [key, values] of Object.entries(labels)) {
    if (!Array.isArray(values) || values.length !== 4 || values.some(value => typeof value !== 'string' || !value.trim())) {
      add('localized label map', 0, `${group}.${key} must have four non-empty labels`);
    }
  }
}

const seasoningLabels = evaluateMap('seasoningLabels');
const seasons = evaluateMap('seasons');
for (const key of Object.keys(seasons || {})) {
  const values = seasoningLabels?.[key];
  if (!Array.isArray(values) || values.length !== 4 || values.some(value => typeof value !== 'string' || !value.trim())) {
    add('localized seasoning label', 0, `${key} must have four non-empty labels`);
  }
}

const cuisineLabels = evaluateMap('cuisineLabels');
for (const [key, labels] of Object.entries(cuisineLabels || {})) {
  for (const locale of ['en', 'zh', 'ja', 'ko']) {
    if (typeof labels?.[locale] !== 'string' || !labels[locale].trim()) {
      add('localized cuisine label', 0, `${key}.${locale} is missing`);
    }
  }
}

if (problems.length) {
  console.error(`i18n audit failed: ${problems.length} fixed user-facing strings remain.`);
  for (const item of problems) console.error(`${item.kind} at line ${item.line}: ${item.text}`);
  process.exitCode = 1;
} else {
  console.log('i18n audit passed: no fixed user-facing strings found outside the translation layer.');
}
