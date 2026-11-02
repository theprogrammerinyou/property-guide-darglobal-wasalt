import { sources } from "../data/knowledge.js";

const stopWords = new Set(
  "a an and are as at be by can do for from how i in is it me my of on or please tell that the this to was what where which who with would".split(
    " "
  )
);

export function retrieveSources(query, limit = 4) {
  const terms =
    query
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((term) => term.length > 1 && !stopWords.has(term)) ?? [];

  return sources
    .map((source) => {
      const searchable =
        `${source.publisher} ${source.title} ${source.content}`.toLowerCase();
      const score = terms.reduce((total, term) => {
        const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const matches = searchable.match(new RegExp(escapedTerm, "gu"));
        return total + Math.min(matches?.length ?? 0, 4);
      }, 0);
      return { source, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ source }) => source);
}
