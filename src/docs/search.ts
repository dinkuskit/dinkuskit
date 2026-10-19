export interface SearchArticle { id: string; title: string; summary: string; url: string; text: string }

/** Small bounded keyword search shared by the browser and future retrieval tools. */
export function searchDocs<T extends SearchArticle>(articles: T[], query: string): T[] {
  const terms = query.toLocaleLowerCase().slice(0, 160).match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!terms.length) return [];
  return articles.map(article => {
    const title = article.title.toLocaleLowerCase();
    const summary = article.summary.toLocaleLowerCase();
    const body = article.text.toLocaleLowerCase();
    const scores = terms.map(term => title.includes(term) ? 6 : summary.includes(term) ? 3 : body.includes(term) ? 1 : 0);
    return { article, score: scores.every(Boolean) ? scores.reduce<number>((sum, value) => sum + value, 0) : 0 };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.article.id.localeCompare(b.article.id))
    .slice(0, 10).map(item => item.article);
}
