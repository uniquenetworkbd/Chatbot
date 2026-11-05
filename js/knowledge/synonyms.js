const GROUPS = [
  ["internet_slow", ["net slow","internet slow","net aste","net dhire","speed kom","slow net","নেট স্লো","ইন্টারনেট স্লো","নেট ধীর","স্পিড কম","গতি কম"]],
  ["no_internet", ["net nai","internet nai","net ashe na","connection nai","wifi chole na","নেট নাই","ইন্টারনেট নেই","নেট আসে না","সংযোগ নেই","ওয়াইফাই চলে না","ওয়াইফাই চলে না"]],
  ["onu_los", ["onu red","los light","red light","pon blink","onu te lal light","onu te red","ওনু লাল","অনু লাল","লস লাইট","লাল বাতি","পন ব্লিংক"]],
  ["billing_amount", ["taka koto","bill koto","koto taka","bill amount","payment koto","টাকা কত","বিল কত","কত টাকা","পেমেন্ট কত"]],
  ["billing_mismatch", ["bill beshi","extra taka","wrong bill","billing mismatch","টাকা বেশি","বিল বেশি","ভুল বিল","অতিরিক্ত টাকা"]],
  ["router_restart", ["router restart","router reboot","router off on","রাউটার রিস্টার্ট","রাউটার বন্ধ চালু","রাউটার রিবুট"]]
];
const ALIASES = new Map();
for (const [canonical, phrases] of GROUPS) {
  ALIASES.set(canonical, canonical);
  for (const phrase of phrases) ALIASES.set(normalizePhrase(phrase), canonical);
}
function normalizePhrase(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("bn")
    .replace(/[০-৯]/g, d => "0123456789"["০১২৩৪৫৬৭৮৯".indexOf(d)])
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
}
export function expandSynonyms(tokens) {
  const output = new Set(tokens);
  const phrase = normalizePhrase(tokens.join(" "));
  for (const [alias, canonical] of ALIASES) {
    if (alias.includes(" ") && phrase.includes(alias)) output.add(canonical);
  }
  for (const token of tokens) {
    const canonical = ALIASES.get(normalizePhrase(token));
    if (canonical) output.add(canonical);
  }
  return [...output];
}
export { GROUPS, normalizePhrase };
