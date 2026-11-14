import type { Loader } from 'astro/loaders';
import { z } from 'astro/zod';
import { XMLParser } from 'fast-xml-parser';

/**
 * note のマガジン（またはユーザー）の記事を、RSS からビルド時に取得する Content Loader。
 *
 * - 取得はビルド時だけ。ページを開いた人のブラウザから note へのリクエストは発生しない。
 * - 記事本文の HTML は持ち込まず、プレーンテキストにした冒頭（excerpt）だけを持つ。
 */

/** https: の URL だけを通す（javascript: などを href や src に出さないため） */
const httpsUrlSchema = z.url({ protocol: /^https$/ });

export const noteArticleSchema = z.object({
  title: z.string(),
  url: httpsUrlSchema,
  pubDate: z.coerce.date(),
  /** 本文冒頭のプレーンテキスト。`<` などの文字を含むことがあるので、HTML としては挿入しない */
  excerpt: z.string(),
  thumbnail: httpsUrlSchema.optional(),
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

/** RSS の <item>。属性のないタグは文字列、属性のあるタグは { '#text', '@_属性名' } になる */
type RssItem = Record<string, unknown>;

const namedEntities: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** 文字参照を1回だけ戻す（&amp;lt; は &lt; にとどめる）。知らない名前のものはそのまま残す */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] !== '#') return namedEntities[body.toLowerCase()] ?? whole;
    const code = /^#x/i.test(body) ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

const graphemes = new Intl.Segmenter('ja', { granularity: 'grapheme' });

/** 見た目の1文字（絵文字なども1文字）を単位にして切る。途中で切って文字を壊さないため */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const chars = Array.from(graphemes.segment(text), (s) => s.segment);
  return chars.length > maxLength ? `${chars.slice(0, maxLength).join('')}…` : text;
}

/**
 * HTML を除去して冒頭テキストを作る（set:html を使わずに表示するため）。
 * 戻り値はプレーンテキストで、本文に書かれた `<` などの文字を含むことがある。HTML としては挿入しないこと。
 */
export function toExcerpt(html: string, maxLength: number, ignore: readonly string[] = []): string {
  let text = decodeEntities(
    html
      .replace(/<a [^>]*>続きをみる<\/a>/g, '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|h\d|li|figure|blockquote)>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  );
  // 定型文（AIで作成した旨の注記など）は紹介文に出さない
  for (const phrase of ignore) {
    if (phrase) text = text.split(phrase).join(' ');
  }
  return truncate(text.replace(/\s+/g, ' ').trim(), maxLength);
}

/** 記事URL（https://note.com/<user>/n/<key>）から記事キーを取り出して id にする */
function toId(url: string): string {
  const match = url.match(/\/n\/([a-z0-9]+)/i);
  return match?.[1] ?? url;
}

/** タグの中身を文字列で取り出す */
function toText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && '#text' in value) return String(value['#text']);
  return undefined;
}

/** https: の URL ならそのまま返し、それ以外は undefined にする */
function toHttpsUrl(value: string | undefined): string | undefined {
  const url = value?.trim();
  if (!url || !URL.canParse(url)) return undefined;
  return new URL(url).protocol === 'https:' ? url : undefined;
}

function pickThumbnail(value: unknown): string | undefined {
  if (value && typeof value === 'object' && '@_url' in value) return toHttpsUrl(String(value['@_url']));
  return toHttpsUrl(toText(value));
}

/**
 * note の RSS（XML の文字列）から記事を取り出す。通信はしない。
 * リンクが https: でない項目と、タイトルのない項目は取り込まない。RSS として読めないときは例外を投げる。
 */
export function parseNoteRss(xml: string, options: NoteParseOptions = {}): NoteRssEntry[] {
  const { excerptLength = 90, excerptIgnore = [] } = options;
  // parseTagValue: false … 数字だけのタイトル（「007」など）を数値に変換させない
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
  const channel = parser.parse(xml)?.rss?.channel;
  if (channel === undefined) throw new Error('RSS として読めませんでした（rss > channel がありません）');

  const rawItems: RssItem | RssItem[] = channel?.item ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  return items.flatMap((item) => {
    const title = toText(item.title);
    const url = toHttpsUrl(toText(item.link));
    if (!title || !url) return [];
    return {
      id: toId(url),
      data: {
        title,
        url,
        pubDate: toText(item.pubDate),
        excerpt: toExcerpt(toText(item.description) ?? '', excerptLength, excerptIgnore),
        thumbnail: pickThumbnail(item['media:thumbnail']),
        creatorName: toText(item['note:creatorName']),
        isSample: false as const,
      },
    };
  });
}

/** 応答の大きさの上限（5 MB）。RSS としてはありえない大きさの応答を、メモリに読み込まないため */
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

/** 応答を文字列で読む。上限を超えたら、そこで読むのをやめて例外を投げる */
async function readText(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error(`応答が大きすぎます（${maxBytes} バイトを超えました）`);
    }
    text += decoder.decode(value, { stream: true });
  }
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
      type Entry = { id: string; data: Record<string, unknown> };

      /**
       * スキーマに通った記事だけを残す。通らない記事は理由をログに出して飛ばす（1件のためにビルドを止めない）。
       * id が同じ記事は先のものを残す（store は id ごとに1件なので、黙って上書きさせない）。
       */
      const validate = async (candidates: Entry[]): Promise<Entry[]> => {
        const valid: Entry[] = [];
        const seen = new Set<string>();
        for (const entry of candidates) {
          if (seen.has(entry.id)) {
            logger.warn(`記事（${entry.id}）は id が重複しているので飛ばします（先の記事を残します）`);
            continue;
          }
          try {
            valid.push({ id: entry.id, data: await parseData(entry) });
            seen.add(entry.id);
          } catch (error) {
            logger.warn(`記事（${entry.id}）を読み取れなかったので飛ばします: ${(error as Error).message}`);
          }
        }
        return valid;
      };

      let entries: Entry[] = [];

      try {
        const res = await fetch(rssUrl, {
          headers: { 'User-Agent': userAgent },
          signal: AbortSignal.timeout(timeout),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const parsed = parseNoteRss(await readText(res, MAX_RESPONSE_BYTES), { excerptLength, excerptIgnore });
        entries = await validate(parsed);
        if (parsed.length > 0 && entries.length === 0) throw new Error('記事を1件も読み取れませんでした');
        logger.info(`note から ${entries.length} 件の記事を取得しました（${rssUrl}）`);
      } catch (error) {
        const reason = `note の RSS を取得できませんでした（${rssUrl}）: ${(error as Error).message}`;
        if (onError === 'throw') throw new Error(reason, { cause: error });
        if (onError === 'fallback' && fallback.length > 0) {
          logger.warn(`${reason}。fallback の記事を表示します。`);
          entries = await validate(fallback.map(({ id, ...data }) => ({ id, data: { ...data, isSample: true } })));
        } else {
          logger.warn(`${reason}。記事の一覧は空になります。`);
          entries = [];
        }
      }

      store.clear();
      for (const entry of entries) {
        store.set(entry);
      }
    },
  } satisfies Loader;
}
