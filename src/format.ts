/**
 * 記事の日付の書式。ビルド時の一覧と、自動更新で差し替えるときの書式をそろえるため、
 * data-date-style と同じ名前（long / dot）で選べるようにする。
 */
export type NoteDateStyle = 'long' | 'dot';

/** 日付を表示用の文字列にする（long：2026年11月7日、dot：2026.11.07） */
export function formatNoteDate(date: Date, style: NoteDateStyle = 'long', timeZone = 'Asia/Tokyo'): string {
  const text = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: style === 'dot' ? '2-digit' : 'long',
    day: style === 'dot' ? '2-digit' : 'numeric',
    timeZone,
  }).format(date);
  return style === 'dot' ? text.replaceAll('/', '.') : text;
}

/** <time datetime> 用の YYYY-MM-DD（timeZone の日付） */
export function isoNoteDate(date: Date, timeZone = 'Asia/Tokyo'): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone }).format(date);
}

/** 記事を新しい順に並べ、limit があれば先頭から切り出す */
export function sortNoteArticles<T extends { pubDate: Date }>(articles: readonly T[], limit?: number): T[] {
  const sorted = [...articles].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
  return limit ? sorted.slice(0, limit) : sorted;
}
