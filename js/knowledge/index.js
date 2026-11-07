import { companyKnowledge } from "./company.js";
import { internetKnowledge } from "./internet.js";
import { billingKnowledge } from "./billing.js";
import { securityKnowledge } from "./security.js";
import { expandSynonyms } from "./synonyms.js";
import { professionalIspKnowledge } from "./professional-isp.js";

export const FALLBACK_RESPONSE = "দুঃখিত, এই বিষয়টি আমার নলেজ বেসে নেই। সঠিক সহায়তার জন্য দয়া করে আমাদের মাইজদী সদর অফিসে যোগাযোগ করুন অথবা ফেসবুক পেজে ইনবক্স করুন।";
const DOCUMENTS = [...companyKnowledge, ...internetKnowledge, ...billingKnowledge, ...securityKnowledge, ...professionalIspKnowledge];
const STOP_WORDS = new Set(["আমি","আমার","আমাকে","আপনি","আপনার","কি","কী","কেন","কিভাবে","কীভাবে","কোথায়","কোথায়","কখন","হবে","হয়","হয়","করুন","দয়া","দয়া","করে","একটি","এবং","জন্য","the","a","an","is","are","what","how","where","when","please","can","you","your","my","to","of","for","and","in","on"]);
const normalize = value => String(value ?? "").normalize("NFKC").toLocaleLowerCase("bn").replace(/[০-৯]/g, digit => "0123456789"["০১২৩৪৫৬৭৮৯".indexOf(digit)]).replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
export function tokenize(value) {
  const normalized = normalize(value);
  if (!normalized) return [];
  return expandSynonyms(normalized.split(/\s+/u).filter(token => token.length > 1 && !STOP_WORDS.has(token)));
}
function documentTerms(document) {
  return new Set([...document.keywords.flatMap(tokenize), ...tokenize(document.response)]);
}
const INDEX = DOCUMENTS.map(document => ({ document, terms: documentTerms(document) }));
const DOCUMENT_FREQUENCY = new Map();
for (const entry of INDEX) for (const term of entry.terms) DOCUMENT_FREQUENCY.set(term, (DOCUMENT_FREQUENCY.get(term) || 0) + 1);
function idf(term) { return Math.log(1 + (INDEX.length + 1) / ((DOCUMENT_FREQUENCY.get(term) || 0) + 1)); }
function scoreDocument(queryTokens, entry, queryText) {
  const querySet = new Set(queryTokens), keywordText = normalize(entry.document.keywords.join(" "));
  let score = 0;
  for (const term of querySet) if (entry.terms.has(term)) score += idf(term) * (keywordText.includes(term) ? 2.2 : 1);
  const exactPhrase = entry.document.keywords.some(keyword => { const phrase=normalize(keyword); return phrase.length>2 && queryText.includes(phrase); });
  if (exactPhrase) score += 4;
  const overlap = [...querySet].filter(term => entry.terms.has(term)).length;
  const coverage = querySet.size ? overlap/querySet.size : 0;
  return { score: score*(0.7+coverage), coverage, exactPhrase };
}
export function searchKnowledge(rawQuery) {
  const queryText=normalize(rawQuery), queryTokens=tokenize(rawQuery);
  if (!queryTokens.length) return { matched:false,score:0,category:null,response:FALLBACK_RESPONSE };
  const ranked=INDEX.map(entry=>({...scoreDocument(queryTokens,entry,queryText),document:entry.document})).sort((a,b)=>b.score-a.score);
  const best=ranked[0], threshold=best?.exactPhrase?1.5:2.1;
  if (!best || best.score<threshold || (best.coverage<0.25&&!best.exactPhrase)) return {matched:false,score:best?.score||0,category:null,response:FALLBACK_RESPONSE};
  return {matched:true,score:Number(best.score.toFixed(3)),category:best.document.category,id:best.document.id,response:best.document.response};
}
export function getKnowledgeStats() {
  return Object.freeze({documents:DOCUMENTS.length,categories:[...new Set(DOCUMENTS.map(item=>item.category))],indexedTerms:DOCUMENT_FREQUENCY.size});
}
export { DOCUMENTS };
