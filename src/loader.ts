import type { Loader } from 'astro/loaders';
import { z } from 'astro/zod';
import { XMLParser } from 'fast-xml-parser';

/**
 * note のマガジン（またはユーザー）の記事を、RSS からビルド時に取得する Content Loader。
 *
 * - 取得はビルド時だけ。ページを開いた人のブラウザから note へのリクエストは発生しない。
 * - 記事本文の HTML は持ち込まず、プレーンテキストにした冒頭（excerpt）だけを持つ。
 */

export const noteArticleSchema = z.object({
  title: z.string(),
  url: z.url(),
  pubDate: z.coerce.date(),
  /** 本文冒頭のプレーンテキスト（HTMLタグは除去済み） */
  excerpt: z.string(),
  thumbnail: z.url().optional(),
  creatorName: z.string().optional(),
  /** true の場合は RSS の取得に失敗して、fallback の記事を表示している */
  isSample: z.boolean(),
});

export type NoteArticle = z.infer<typeof noteArticleSchema>;

/** fallback に渡す記事（id を付け、isSample は付けない） */
export type NoteFallbackArticle = Omit<NoteArticle, 'isSample' | 'pubDate'> & {
  id: string;
  pubDate: string | Date;
};

/**
 * RSS を取得できなかったときの扱い。
 * - 'fallback'：fallback の記事（isSample: true）で続ける。fallback がなければ空の一覧（既定）
 * - 'empty'：空の一覧で続ける
 * - 'throw'：ビルドを止める
 */
export type NoteOnError = 'fallback' | 'empty' | 'throw';

export interface NoteLoaderOptions {
  /** RSS の URL（マガジン：https://note.com/<user>/m/<key>/rss、ユーザー：https://note.com/<user>/rss） */
  rssUrl: string;
  /** 取得に失敗したときに使う記事 */
  fallback?: NoteFallbackArticle[];
  /** 取得に失敗したときの扱い（既定は 'fallback'） */
  onError?: NoteOnError;
  /** 本文抜粋の最大文字数（既定は 90） */
  excerptLength?: number;
  /** 本文抜粋から取り除く定型文 */
  excerptIgnore?: readonly string[];
  /** 取得時の User-Agent（既定は 'astro-note-embed (build)'） */
  userAgent?: string;
  /** 取得の待ち時間の上限（ミリ秒。既定は 15000） */
  timeout?: number;
}

export interface NoteParseOptions {
  excerptLength?: number;
  excerptIgnore?: readonly string[];
}

/** RSS から取り出した記事（スキーマを通す前の値） */
export interface NoteRssEntry {
  id: string;
  data: {
    title: string;
    url: string;
    pubDate: string | undefined;
    excerpt: string;
    thumbnail: string | undefined;
    creatorName: string | undefined;
    isSample: false;
  };
}

interface RssItem {
  title?: string;
  link?: string;
  guid?: string | { '#text': string };
  pubDate?: string;
  description?: string;
  'media:thumbnail'?: string | { '#text'?: string; '@_url'?: string };
  'note:creatorName'?: string;
}

/** HTML を除去して冒頭テキストを作る（set:html を使わずに安全に表示するため） */
export function toExcerpt(html: string, maxLength: number, ignore: readonly string[] = []): string {
  let text = html
    .replace(/<a [^>]*>続きをみる<\/a>/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|h\d|li|figure|blockquote)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  // 定型文（AIで作成した旨の注記など）は紹介文に出さない
  for (const phrase of ignore) {
    text = text.split(phrase).join(' ');
  }
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/** 記事URL（https://note.com/<user>/n/<key>）から記事キーを取り出して id にする */
function toId(url: string): string {
  const match = url.match(/\/n\/([a-z0-9]+)/i);
  return match?.[1] ?? url;
}

function pickThumbnail(value: RssItem['media:thumbnail']): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value.trim();
  return (value['@_url'] ?? value['#text'])?.trim();
}

/** note の RSS（XML の文字列）から記事を取り出す。通信はしない */
export function parseNoteRss(xml: string, options: NoteParseOptions = {}): NoteRssEntry[] {
  const { excerptLength = 90, excerptIgnore = [] } = options;
  const parser = new XMLParser({ ignoreAttributes: false });
  const feed = parser.parse(xml);
  const rawItems: RssItem | RssItem[] = feed?.rss?.channel?.item ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  return items
    .filter((item) => item.link && item.title)
    .map((item) => ({
      id: toId(item.link!),
      data: {
        title: String(item.title),
        url: item.link!,
        pubDate: item.pubDate,
        excerpt: toExcerpt(item.description ?? '', excerptLength, excerptIgnore),
        thumbnail: pickThumbnail(item['media:thumbnail']),
        creatorName: item['note:creatorName'],
        isSample: false,
      },
    }));
}

export function noteMagazineLoader(options: NoteLoaderOptions) {
  const {
    rssUrl,
    fallback = [],
    onError = 'fallback',
    excerptLength = 90,
    excerptIgnore = [],
    userAgent = 'astro-note-embed (build)',
    timeout = 15_000,
  } = options;

  return {
    name: 'note-magazine-loader',
    schema: noteArticleSchema,
    load: async ({ store, logger, parseData }) => {
      let entries: Array<{ id: string; data: Record<string, unknown> }> = [];

      try {
        const res = await fetch(rssUrl, {
          headers: { 'User-Agent': userAgent },
          signal: AbortSignal.timeout(timeout),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        entries = parseNoteRss(await res.text(), { excerptLength, excerptIgnore });
        logger.info(`note から ${entries.length} 件の記事を取得しました（${rssUrl}）`);
      } catch (error) {
        const reason = `note の RSS を取得できませんでした（${rssUrl}）: ${(error as Error).message}`;
        if (onError === 'throw') throw new Error(reason, { cause: error });
        if (onError === 'fallback' && fallback.length > 0) {
          logger.warn(`${reason}。fallback の記事を表示します。`);
          entries = fallback.map(({ id, ...data }) => ({ id, data: { ...data, isSample: true } }));
        } else {
          logger.warn(`${reason}。記事の一覧は空になります。`);
          entries = [];
        }
      }

      store.clear();
      for (const entry of entries) {
        const data = await parseData(entry);
        store.set({ id: entry.id, data });
      }
    },
  } satisfies Loader;
}
