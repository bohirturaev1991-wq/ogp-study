// Узбекская кириллица → латиница (действующий алфавит: oʻ, gʻ, ʼ).
const MAP = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'x', ч: 'ch', ш: 'sh', щ: 'sh', ъ: 'ʼ', ы: 'i', ь: '', э: 'e', ю: 'yu',
  я: 'ya', ў: 'oʻ', қ: 'q', ғ: 'gʻ', ҳ: 'h',
};
const VOWELS = new Set('аеёиоуэюяўАЕЁИОУЭЮЯЎ'.split(''));
const isLetter = (c) => !!c && /\p{L}/u.test(c);
const isUpper = (c) => !!c && c !== c.toLowerCase();

export function cyrToLat(text) {
  let out = '';
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const lower = c.toLowerCase();
    let lat;
    if (lower === 'е') {
      const prev = chars[i - 1];
      // «е» в начале слова и после гласной / ъ / ь читается как «ye»
      lat = !isLetter(prev) || VOWELS.has(prev) || /[ъьЪЬ]/.test(prev) ? 'ye' : 'e';
    } else if (lower === 'ц') {
      const prev = chars[i - 1];
      lat = !isLetter(prev) || !VOWELS.has(prev) ? 's' : 'ts'; // «sirk», «konsert», но «Konstitutsiya»
    } else if (lower in MAP) {
      lat = MAP[lower];
    } else {
      out += c;
      continue;
    }
    if (isUpper(c) && lat) {
      const next = chars[i + 1];
      const prev = chars[i - 1];
      const allCaps = (isLetter(next) && isUpper(next)) || (!isLetter(next) && isLetter(prev) && isUpper(prev));
      lat = allCaps ? lat.toUpperCase() : lat[0].toUpperCase() + lat.slice(1);
    }
    out += lat;
  }
  return out;
}
