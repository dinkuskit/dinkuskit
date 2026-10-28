export interface SearchArticle { id: string; title: string; summary: string; url: string; text: string }

/** Words the browser search and the docs MCP both match on. The query is capped at 160 characters. */
export function searchTerms(query: string) {
  return query.toLocaleLowerCase().slice(0, 160).match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Ranked keyword search shared by the browser and the docs MCP. At most ten hits, title before summary before body. */
export function rankDocs<T extends SearchArticle>(articles: T[], query: string) {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  return articles.map(article => {
    const title = article.title.toLocaleLowerCase();
    const summary = article.summary.toLocaleLowerCase();
    const body = article.text.toLocaleLowerCase();
    const scores = terms.map(term => title.includes(term) ? 6 : summary.includes(term) ? 3 : body.includes(term) ? 1 : 0);
    return { article, score: scores.every(Boolean) ? scores.reduce<number>((sum, value) => sum + value, 0) : 0 };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.article.id.localeCompare(b.article.id))
    .slice(0, 10);
}

export function searchDocs<T extends SearchArticle>(articles: T[], query: string): T[] {
  return rankDocs(articles, query).map(item => item.article);
}
