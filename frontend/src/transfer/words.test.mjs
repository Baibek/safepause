// Run: node --test src/transfer/words.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { amountInWords } from "./words.js";

test("Kazakh", () => {
  assert.equal(amountInWords(15000, "kk"), "Он бес мың теңге");
  assert.equal(amountInWords(1800000, "kk"), "Бір миллион сегіз жүз мың теңге");
  assert.equal(amountInWords(2450321, "kk"), "Екі миллион төрт жүз елу мың үш жүз жиырма бір теңге");
  assert.equal(amountInWords(100, "kk"), "Жүз теңге");
  assert.equal(amountInWords(0, "kk"), "Нөл теңге");
});

test("Russian, with gender and plural forms", () => {
  assert.equal(amountInWords(15000, "ru"), "Пятнадцать тысяч тенге");
  assert.equal(amountInWords(1800000, "ru"), "Один миллион восемьсот тысяч тенге");
  assert.equal(amountInWords(21000, "ru"), "Двадцать одна тысяча тенге");
  assert.equal(amountInWords(2000, "ru"), "Две тысячи тенге");
  assert.equal(amountInWords(3000000, "ru"), "Три миллиона тенге");
  assert.equal(amountInWords(111, "ru"), "Сто одиннадцать тенге");
});

test("empty or invalid amount gives empty text", () => {
  assert.equal(amountInWords(NaN, "kk"), "");
  assert.equal(amountInWords(-5, "ru"), "");
});
