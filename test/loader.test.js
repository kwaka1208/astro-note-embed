// loader の解析部分のテスト。保存した架空の RSS を使い、note へは取りに行かない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  formatNoteDate,
  isoNoteDate,
  noteArticleSchema,
  noteMagazineLoader,
  parseNoteRss,
  sortNoteArticles,
  toExcerpt,
} from '../dist/index.js';

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('記事を取り出す（リンクのない項目は取り込まない）', async () => {
  const entries = parseNoteRss(await fixture('magazine.xml'));
  assert.equal(entries.length, 2);
  const [first, second] = entries;
  assert.equal(first.id, 'n0000000000a1');
  assert.equal(first.data.title, '春の作業日のお知らせ');
  assert.equal(first.data.url, 'https://note.com/example_user/n/n0000000000a1');
  assert.equal(first.data.pubDate, 'Sat, 07 Nov 2026 20:40:19 +0900');
  assert.equal(first.data.thumbnail, 'https://assets.st-note.com/production/uploads/images/1/example.png?width=800');
  assert.equal(first.data.creatorName, '架空の書き手');
  assert.equal(first.data.isSample, false);
  assert.equal(second.data.thumbnail, undefined);
  assert.equal(second.data.creatorName, undefined);
});

test('抜粋：タグを除き、文字参照を戻し、「続きをみる」を落とす', async () => {
  const [first] = parseNoteRss(await fixture('magazine.xml'), { excerptLength: 200 });
  assert.equal(
    first.data.excerpt,
    `4月の作業日は 2回です。 道具は&こちらで<用意>します。 持ち物 軍手と"飲み物"、それから'帽子'。※この記事はAIで作成しています。`,
  );
});

test('抜粋：定型文を取り除き、長さで切る', async () => {
  const [first] = parseNoteRss(await fixture('magazine.xml'), {
    excerptLength: 10,
    excerptIgnore: ['※この記事はAIで作成しています。'],
  });
  assert.equal(first.data.excerpt, '4月の作業日は 2回…');
  assert.equal(toExcerpt('<p>あいう</p>', 10, ['い']), 'あ う');
});

test('既定の抜粋は90文字まで', () => {
  const [entry] = parseNoteRss(
    `<rss><channel><item><title>t</title><link>https://note.com/u/n/nabc</link><description>${'あ'.repeat(100)}</description></item></channel></rss>`,
  );
  assert.equal(entry.data.excerpt, `${'あ'.repeat(90)}…`);
});

test('記事が1件だけの RSS と、属性で書かれたサムネイル', async () => {
  const entries = parseNoteRss(await fixture('single.xml'));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].data.thumbnail, 'https://assets.st-note.com/production/uploads/images/2/example.png');
});

test('記事のない RSS は空の配列', () => {
  assert.deepEqual(parseNoteRss('<rss><channel><title>x</title></channel></rss>'), []);
});

const item = (inner) => `<rss><channel><item>${inner}</item></channel></rss>`;
const link = '<link>https://note.com/u/n/nabc</link>';

test('RSS でないもの（200 で返るお知らせ画面など）は例外にする', () => {
  assert.throws(() => parseNoteRss('<!doctype html><html><body><p>メンテナンス中</p></body></html>'), /RSS として読めません/);
  assert.throws(() => parseNoteRss('not xml'), /RSS として読めません/);
});

test('数字だけの値を数値に変えない', () => {
  for (const title of ['007', '1.0', '1e3', '0x10', '+81', '0']) {
    assert.equal(parseNoteRss(item(`<title>${title}</title>${link}`))[0].data.title, title);
  }
  const [entry] = parseNoteRss(
    item(`<title>t</title>${link}<description><![CDATA[2026]]></description><creatorName>12345</creatorName>`).replace(
      /creatorName/g,
      'note:creatorName',
    ),
  );
  assert.equal(entry.data.excerpt, '2026');
  assert.equal(entry.data.creatorName, '12345');
});

test('https: でない URL は通さない', () => {
  for (const url of ['javascript:alert(1)//n/abc', 'data:text/html,x', 'http://note.com/u/n/nabc']) {
    assert.deepEqual(parseNoteRss(item(`<title>t</title><link>${url}</link>`)), []);
    const [entry] = parseNoteRss(item(`<title>t</title>${link}<media:thumbnail url="${url}"/>`));
    assert.equal(entry.data.thumbnail, undefined);
    const base = { title: 't', pubDate: '2026-11-01', excerpt: '', isSample: false };
    assert.equal(noteArticleSchema.safeParse({ ...base, url }).success, false);
    assert.equal(noteArticleSchema.safeParse({ ...base, url: 'https://note.com/u/n/nabc', thumbnail: url }).success, false);
  }
});

test('抜粋：文字参照は1回だけ戻し、絵文字の途中で切らない', () => {
  assert.equal(toExcerpt('<p>&amp;lt;b&amp;gt; &#x27;&#8230;&apos; &hellip;</p>', 90), "&lt;b&gt; '…' &hellip;");
  assert.equal(toExcerpt(`${'あ'.repeat(9)}😀いう`, 10), `${'あ'.repeat(9)}😀…`);
  assert.equal(toExcerpt('あ👨‍👩‍👧い', 2), 'あ👨‍👩‍👧…');
  assert.equal(toExcerpt('😀😀', 2), '😀😀');
  assert.equal(toExcerpt('abc', 90, ['']), 'abc');
});

test('日付の書式と並べ替え', () => {
  const date = new Date('2026-11-07T20:40:19+09:00');
  assert.equal(formatNoteDate(date), '2026年11月7日');
  assert.equal(formatNoteDate(date, 'dot'), '2026.11.07');
  assert.equal(isoNoteDate(new Date('2026-10-31T23:30:00+09:00')), '2026-10-31');
  const sorted = sortNoteArticles([{ pubDate: new Date(1) }, { pubDate: new Date(3) }, { pubDate: new Date(2) }], 2);
  assert.deepEqual(sorted.map((a) => a.pubDate.getTime()), [3, 2]);
});

test('並べ替えの limit：省略は全件、0 と負の数は 0 件', () => {
  const articles = [{ pubDate: new Date(1) }, { pubDate: new Date(2) }];
  assert.equal(sortNoteArticles(articles).length, 2);
  assert.equal(sortNoteArticles(articles, 0).length, 0);
  assert.equal(sortNoteArticles(articles, -1).length, 0);
});

// loader の取得失敗時の扱い（fetch を差し替えて試す）
function fakeContext() {
  const items = new Map();
  const logs = [];
  return {
    items,
    logs,
    store: { clear: () => items.clear(), set: ({ id, data }) => items.set(id, data) },
    logger: { info: (m) => logs.push(['info', m]), warn: (m) => logs.push(['warn', m]) },
    parseData: async ({ data }) => data,
  };
}

async function withFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

const failing = async () => new Response('', { status: 500 });
const fallback = [{ id: 'sample1', title: '見本', url: 'https://note.com/example_user/n/nsample1', pubDate: '2026-11-01', excerpt: '見本の記事' }];

test('取得に成功したら記事を入れる。User-Agent を付ける', async () => {
  const xml = await fixture('magazine.xml');
  let headers;
  const ctx = fakeContext();
  await withFetch(async (_url, init) => ((headers = init.headers), new Response(xml)), () =>
    noteMagazineLoader({ rssUrl: 'https://note.com/example_user/m/m0000000000aa/rss' }).load(ctx),
  );
  assert.equal(ctx.items.size, 2);
  assert.equal(headers['User-Agent'], 'astro-note-embed (build)');
});

test("取得に失敗したら fallback を isSample: true で使う（既定の 'fallback'）", async () => {
  const ctx = fakeContext();
  await withFetch(failing, () => noteMagazineLoader({ rssUrl: 'https://note.com/x/rss', fallback }).load(ctx));
  assert.equal(ctx.items.get('sample1').isSample, true);
  assert.equal(ctx.logs.at(-1)[0], 'warn');
});

test("'empty' は空の一覧で続ける", async () => {
  const ctx = fakeContext();
  ctx.items.set('old', {});
  await withFetch(failing, () => noteMagazineLoader({ rssUrl: 'https://note.com/x/rss', fallback, onError: 'empty' }).load(ctx));
  assert.equal(ctx.items.size, 0);
});

// スキーマの検証も行う文脈（Astro の parseData と同じく、通らなければ例外）
function validatingContext() {
  return { ...fakeContext(), parseData: async ({ data }) => noteArticleSchema.parse(data) };
}

const dated = (key) => `<item><title>${key}</title><link>https://note.com/u/n/${key}</link><pubDate>Mon, 02 Nov 2026 09:00:00 +0900</pubDate></item>`;
const undated = (key) => `<item><title>${key}</title><link>https://note.com/u/n/${key}</link></item>`;
const respond = (items) => async () => new Response(`<rss><channel>${items}</channel></rss>`);

test('スキーマに通らない記事は飛ばし、残りを入れる', async () => {
  const ctx = validatingContext();
  await withFetch(respond(dated('ok1') + undated('bad1')), () => noteMagazineLoader({ rssUrl: 'https://note.com/x/rss' }).load(ctx));
  assert.deepEqual([...ctx.items.keys()], ['ok1']);
  assert.ok(ctx.logs.some(([level, message]) => level === 'warn' && message.includes('bad1')));
});

test('1件も読み取れないときと、RSS でない応答は、取得の失敗として扱う', async () => {
  for (const impl of [respond(undated('bad1')), async () => new Response('<html><body>メンテナンス中</body></html>')]) {
    const ctx = validatingContext();
    await withFetch(impl, () => noteMagazineLoader({ rssUrl: 'https://note.com/x/rss', fallback }).load(ctx));
    assert.equal(ctx.items.get('sample1').isSample, true);
  }
});

test('fallback の記事もスキーマに通らなければ飛ばす（ビルドは止めない）', async () => {
  const ctx = validatingContext();
  const mixed = [...fallback, { ...fallback[0], id: 'sample2', url: 'javascript:alert(1)' }];
  await withFetch(failing, () => noteMagazineLoader({ rssUrl: 'https://note.com/x/rss', fallback: mixed }).load(ctx));
  assert.deepEqual([...ctx.items.keys()], ['sample1']);
});

test("'throw' はビルドを止める", async () => {
  const ctx = fakeContext();
  await assert.rejects(
    withFetch(failing, () => noteMagazineLoader({ rssUrl: 'https://note.com/x/rss', onError: 'throw' }).load(ctx)),
    /HTTP 500/,
  );
});
