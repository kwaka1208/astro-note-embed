import { defineCollection } from 'astro:content';
import { noteMagazineLoader } from 'astro-note-embed';

/**
 * 表示するマガジンの RSS は環境変数 NOTE_RSS_URL で渡す。
 *   NOTE_RSS_URL=https://note.com/<user>/m/<key>/rss npm run build
 * 渡さないときは架空の URL になり、取得に失敗して fallback の記事（架空）が表示される。
 */
const rssUrl = import.meta.env.NOTE_RSS_URL ?? 'https://note.com/example_user/m/m0000000000aa/rss';

const notes = defineCollection({
  loader: noteMagazineLoader({
    rssUrl,
    onError: 'fallback',
    fallback: [
      {
        id: 'sample-1',
        title: '見本の記事（架空）',
        url: 'https://note.com/example_user/n/n0000000000a1',
        pubDate: '2026-11-07T20:40:19+09:00',
        excerpt: 'RSS を取得できなかったときに表示する見本の記事です。',
      },
      {
        id: 'sample-2',
        title: 'もう1つの見本の記事（架空）',
        url: 'https://note.com/example_user/n/n0000000000a2',
        pubDate: '2026-10-31T23:30:00+09:00',
        excerpt: '本文の抜粋がここに入ります。',
      },
    ],
  }),
});

export const collections = { notes };
