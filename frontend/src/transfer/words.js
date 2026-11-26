// Amount in words, as written on a Kazakh payment order: helps a client notice a wrong number of zeros.

const KK = {
  ones: ["", "бір", "екі", "үш", "төрт", "бес", "алты", "жеті", "сегіз", "тоғыз"],
  tens: ["", "он", "жиырма", "отыз", "қырық", "елу", "алпыс", "жетпіс", "сексен", "тоқсан"],
};

function kkTriple(n) {
  const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), o = n % 10;
  return [h === 1 ? "жүз" : h > 1 ? `${KK.ones[h]} жүз` : "", KK.tens[t], KK.ones[o]].filter(Boolean).join(" ");
}

const RU = {
  ones: ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"],
  onesF: ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"],
  teens: ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"],
  tens: ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"],
  hundreds: ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"],
};

function ruTriple(n, feminine) {
  const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), o = n % 10;
  const tail = t === 1 ? [RU.teens[o]] : [RU.tens[t], (feminine ? RU.onesF : RU.ones)[o]];
  return [RU.hundreds[h], ...tail].filter(Boolean).join(" ");
}

function ruPlural(n, [one, few, many]) {
  const d = n % 10, dd = n % 100;
  if (dd >= 11 && dd <= 14) return many;
  if (d === 1) return one;
  if (d >= 2 && d <= 4) return few;
  return many;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function amountInWords(value, lang) {
  if (!Number.isFinite(value) || value < 0) return "";
  const n = Math.floor(value);
  if (n === 0) return lang === "ru" ? "Ноль тенге" : "Нөл теңге";
  const millions = Math.floor(n / 1e6), thousands = Math.floor((n % 1e6) / 1e3), rest = n % 1e3;
  const parts = [];
  if (lang === "ru") {
    if (millions) parts.push(ruTriple(millions, false), ruPlural(millions, ["миллион", "миллиона", "миллионов"]));
    if (thousands) parts.push(ruTriple(thousands, true), ruPlural(thousands, ["тысяча", "тысячи", "тысяч"]));
    if (rest) parts.push(ruTriple(rest, false));
    return cap(parts.join(" ") + " тенге");
  }
  if (millions) parts.push(kkTriple(millions), "миллион");
  if (thousands) parts.push(kkTriple(thousands), "мың");
  if (rest) parts.push(kkTriple(rest));
  return cap(parts.join(" ") + " теңге");
}
