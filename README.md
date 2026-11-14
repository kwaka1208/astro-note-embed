# astro-note-embed

[Astro](https://astro.build/) のサイトに、[note](https://note.com/) のマガジン（またはユーザー）の記事一覧を表示するコンポーネントです。

- **Content Loader**：ビルド時に note の RSS を取得し、記事を Content Collections に入れます。一覧を表示するだけなら、ページを開いた人のブラウザから note へのリクエストは発生しません（見出し画像を出すときと、`NoteEmbed` を使うときは発生します）。
- **表示コンポーネント**：記事の一覧（`NoteList`）、記事1件の既定の見た目（`NoteItem`）、note 公式の埋め込み（`NoteEmbed`）。

> **非公式のコンポーネントです。** note株式会社とは関係がなく、note株式会社が提供・保証するものではありません。「note」はnote株式会社の登録商標です。

## 必要なもの

- Astro 7 以上
- Node.js 22.23.4 以上（Astro 7 の要件）

## インストール

```bash
npm install astro-note-embed
```

## 最小の使い方

1. `src/content.config.ts` でコレクションを作ります。`rssUrl` には、表示したいマガジンの URL の末尾に `/rss` を付けたものを書きます。

   ```ts
   import { defineCollection } from 'astro:content';
   import { noteMagazineLoader } from 'astro-note-embed';

   const notes = defineCollection({
     loader: noteMagazineLoader({
       rssUrl: 'https://note.com/<ユーザー名>/m/<マガジンのキー>/rss',
     }),
   });

   export const collections = { notes };
   ```

2. ページで記事を取り出し、`NoteList` に渡します。

   ```astro
   ---
   import { getCollection } from 'astro:content';
   import { sortNoteArticles } from 'astro-note-embed';
   import NoteList from 'astro-note-embed/NoteList.astro';

   const articles = sortNoteArticles((await getCollection('notes')).map((entry) => entry.data));
   ---

   <NoteList articles={articles} limit={5} />
   ```

`example/` に、このまま動く最小のサイトがあります（`NOTE_RSS_URL=<RSS の URL> npm run build`）。

## loader のオプション

`noteMagazineLoader(options)`

| オプション | 型 | 既定 | 内容 |
|---|---|---|---|
| `rssUrl` | `string` | （必須） | RSS の URL。マガジンは `https://note.com/<user>/m/<key>/rss`、ユーザーの全記事は `https://note.com/<user>/rss` |
| `onError` | `'fallback' \| 'empty' \| 'throw'` | `'fallback'` | 取得に失敗したときの扱い（下の「取得に失敗したとき」） |
| `fallback` | `NoteFallbackArticle[]` | `[]` | 取得に失敗したときに表示する記事 |
| `excerptLength` | `number` | `90` | 本文の抜粋の最大文字数（絵文字も1文字と数える）。超えた分は `…` で切る |
| `excerptIgnore` | `string[]` | `[]` | 抜粋から取り除く定型文 |
| `userAgent` | `string` | `'astro-note-embed (build)'` | 取得時の User-Agent |
| `timeout` | `number` | `15000` | 取得の待ち時間の上限（ミリ秒） |

コレクションに入る記事（`NoteArticle`）：

| 項目 | 型 | 内容 |
|---|---|---|
| `title` | `string` | 記事のタイトル |
| `url` | `string` | 記事の URL（`https:` のものだけ） |
| `pubDate` | `Date` | 公開日時 |
| `excerpt` | `string` | 本文の冒頭のプレーンテキスト。本文に書かれた `<` などの文字を含むことがあるので、HTML としては挿入しないでください |
| `thumbnail` | `string \| undefined` | 見出し画像の URL（`https:` のものだけ） |
| `creatorName` | `string \| undefined` | 書き手の名前 |
| `isSample` | `boolean` | `true` のときは、取得に失敗して `fallback` の記事を表示している |

記事の id は、記事の URL の `/n/` のあとの文字列です。RSS で取れるのは、note が配信している最新の記事（数十件）までです。

### 取得に失敗したとき

オフラインで作業しているときや、note の応答がないときの扱いを `onError` で選べます。

- `'fallback'`（既定）：`fallback` の記事を `isSample: true` にして続けます。`fallback` がなければ空の一覧で続けます。ビルドは止まりません。
- `'empty'`：空の一覧で続けます。
- `'throw'`：ビルドを止めます。古い記事のまま公開したくないときに使います。

どの場合も、ビルドのログに理由が出ます。

次の場合も、取得の失敗として扱います。

- 応答が RSS として読めないとき（お知らせの画面が返ってきたときなど）
- 記事を1件も読み取れないとき（note の仕様が変わったときなど）

一部の記事だけが読み取れないとき（日付がない、URL が `https:` でないなど）は、その記事を飛ばして続けます。飛ばした記事と理由はビルドのログに出ます。`fallback` の記事も同じ扱いです。

### そのほかに使える関数

| 関数 | 内容 |
|---|---|
| `sortNoteArticles(articles, limit?)` | 新しい順に並べ、`limit` 件に切る。`limit` を省略すると全件、`0` は 0 件 |
| `formatNoteDate(date, style?, timeZone?)` | 日付を文字列にする。`style` は `'long'`（2026年11月7日）か `'dot'`（2026.11.07）。`timeZone` の既定は `'Asia/Tokyo'` |
| `isoNoteDate(date, timeZone?)` | `<time datetime>` 用の `YYYY-MM-DD` |
| `parseNoteRss(xml, options?)` | RSS の文字列から記事を取り出す（通信はしない）。`options` は `excerptLength`・`excerptIgnore`。RSS として読めないときは例外を投げる |
| `toExcerpt(html, maxLength, ignore?)` | HTML からプレーンテキストの抜粋を作る |

## NoteList

```astro
<NoteList articles={articles} limit={5} dateStyle="dot" />
```

| props | 型 | 既定 | 内容 |
|---|---|---|---|
| `articles` | `NoteArticle[]` | （必須） | 表示する記事（新しい順に並べたもの） |
| `limit` | `number` | なし（全件） | 表示する件数。`0` は 0 件 |
| `item` | コンポーネント | `NoteItem` | 1件分を描くコンポーネント（下の「1件分の見た目を変える」） |
| `itemProps` | `object` | `{}` | `item` に追加で渡す props（例：`{ showThumbnail: true }`） |
| `dateStyle` | `'long' \| 'dot'` | `'long'` | 日付の書式 |
| `dateSuffix` | `string` | `''` | 日付のうしろに付ける文字（例：`' · note'`） |
| `timeZone` | `string` | `'Asia/Tokyo'` | 日付を決めるタイムゾーン |
| `target` | `string` | `'_blank'` | リンクの `target`。`'_blank'` のときは `rel="noopener noreferrer"` を付ける |
| `sampleNotice` | `string \| false` | 「noteの記事を取得できなかったため、サンプル記事を表示しています。」 | `fallback` の記事を表示しているときの注意書き。`false` で出さない |
| `live` | `{ endpoint: string } \| false` | `false` | 自動更新とつなぐ属性を出す（下の「自動更新とつなぐ」） |
| `class` | `string` | なし | 一覧の外側の要素に付けるクラス |

そのほかの属性は、一覧の外側の要素にそのまま付きます。

出力される HTML：

```html
<div class="note-list">
  <p class="note-list__notice" role="note" data-note-notice>…</p>   <!-- fallback を表示しているときだけ -->
  <ul class="note-list__items" data-note-items>
    <li class="note-list__item"> 1件分（item） </li>
  </ul>
</div>
```

### NoteItem（1件分の既定の見た目）

`NoteList` が既定で使います。`itemProps` で次の props を渡せます。

| props | 型 | 既定 | 内容 |
|---|---|---|---|
| `showExcerpt` | `boolean` | `true` | 本文の抜粋を出す |
| `showThumbnail` | `boolean` | `false` | 見出し画像を出す |
| `newTabLabel` | `string` | 「（新しいタブで開きます）」 | `target="_blank"` のときに読み上げで伝える文（画面には出さない）。空文字で出さない |

出力される HTML：

```html
<a class="note-item" href="…" target="_blank" rel="noopener noreferrer" data-note-link>
  <img class="note-item__thumb" src="…" alt="" data-note-img>   <!-- showThumbnail のときだけ -->
  <time class="note-item__date" datetime="2026-11-07" data-note-date>2026年11月7日</time>
  <span class="note-item__title" data-note-title>…</span>
  <span class="note-item__excerpt" data-note-excerpt>…</span>
  <span class="note-item__new-tab">（新しいタブで開きます）</span>
</a>
```

### 見た目を整える

既定の CSS は最小限で、すべて `:where()` で書いてあります（詳細度が 0）。サイトの CSS で、上のクラス名にそのまま上書きできます。

Astro のスコープ付きスタイルから当てるときは、一覧の中の要素はこのパッケージのコンポーネントが描くので `:global()` を使います。

```astro
<NoteList class="news" articles={articles} />

<style>
  .news :global(.note-list__items) {
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  }
</style>
```

### 1件分の見た目を変える

`item` に自分のコンポーネントを渡します。コンポーネントは次の props を受け取ります。

- `article`（`NoteArticle`）：表示する記事。**`live` を使うときは、`article` なしでも呼ばれます**（自動更新のためのひな形。下の「自動更新とつなぐ」）
- `dateStyle`・`dateSuffix`・`timeZone`・`target`、それと `itemProps` の中身

```astro
---
// src/components/NoteCard.astro
import type { NoteArticle, NoteDateStyle } from 'astro-note-embed';
import { formatNoteDate, isoNoteDate } from 'astro-note-embed';

interface Props {
  article?: NoteArticle;
  dateStyle?: NoteDateStyle;
}

const { article, dateStyle = 'long' } = Astro.props;
---

<a class="card" href={article?.url} target="_blank" rel="noopener noreferrer" data-note-link>
  <time datetime={article && isoNoteDate(article.pubDate)} data-note-date>
    {article && formatNoteDate(article.pubDate, dateStyle)}
  </time>
  <span data-note-title>{article?.title}</span>
</a>
```

```astro
<NoteList articles={articles} item={NoteCard} />
```

記事の値はすべて Astro の通常の式（`{...}`）で出すので、エスケープされます。`set:html` や `innerHTML` は使いません。

## NoteEmbed（記事を1件埋め込む）

note 公式の埋め込み（iframe）で、記事を1件表示します。ページを開いたときに note のスクリプトと iframe を読み込むので、外部への通信が発生します。

```astro
---
import NoteEmbed from 'astro-note-embed/NoteEmbed.astro';
---

<NoteEmbed url="https://note.com/<ユーザー名>/n/<記事のキー>" />
```

| props | 型 | 既定 | 内容 |
|---|---|---|---|
| `url` | `string` | （必須） | 記事の URL |
| `title` | `string` | 「noteの記事」 | iframe の `title`（読み上げ用） |

note のスクリプト（`https://note.com/scripts/embed.js`）は、設置したページの中で動きます。Content Security Policy を設定しているサイトでは、`script-src` と `frame-src` に `https://note.com` を加えてください。

## 自動更新とつなぐ

ビルド時の取得だけでは、ビルドし直すまで新しい記事が出ません。公開後に一覧を新しくする仕組み（サーバーで RSS を取り直して JSON に書き出し、ブラウザで一覧を差し替えるなど）は、**このパッケージには含めていません**。自分で用意する場合のつなぎ目として、`live` を渡すと次の属性と `<template>` を出します。

```astro
<NoteList articles={articles} limit={3} dateStyle="dot" live={{ endpoint: '/data/notes.json' }} />
```

```html
<div class="note-list" data-note-list data-note-endpoint="/data/notes.json" data-limit="3" data-date-style="dot">
  <p data-note-notice>…</p>
  <ul data-note-items> ビルド時の一覧 </ul>
  <template data-note-template>
    <li class="note-list__item"> article なしで描いた1件分（ひな形） </li>
  </template>
</div>
```

属性の仕様：

| 属性 | 付く要素 | 内容 |
|---|---|---|
| `data-note-list` | 一覧の外側 | 差し替えの対象であることを示す |
| `data-note-endpoint` | 一覧の外側 | `live.endpoint` の値（記事一覧の JSON の URL） |
| `data-limit` | 一覧の外側 | `limit` の値（差し替え後の件数） |
| `data-date-style` | 一覧の外側 | `dateStyle` の値（`long` か `dot`） |
| `data-date-suffix` | 一覧の外側 | `dateSuffix` の値（空なら付かない） |
| `data-note-notice` | 注意書き | 新しい一覧に差し替えたら消してよい要素 |
| `data-note-items` | `<ul>` | 中身を差し替える要素 |
| `data-note-template` | `<template>` | 1件分のひな形 |
| `data-note-link` | ひな形の中 | `href` に記事の URL を入れる要素 |
| `data-note-title` | ひな形の中 | タイトルを入れる要素 |
| `data-note-excerpt` | ひな形の中 | 抜粋を入れる要素 |
| `data-note-date` | ひな形の中 | 日付を入れる `<time>`（`datetime` も） |
| `data-note-img` | ひな形の中 | 見出し画像の `<img>`（ひな形では `hidden`） |

差し替えるスクリプトを書くときは、値を `textContent` と属性だけで入れ、`innerHTML` は使わないでください。URL は `https:` のものだけを通してください。

## 使うときの注意

- **表示するのは、自分の記事か、書き手の承諾を得た記事にしてください。** note のご利用規約では、記事の著作権は書き手（クリエイター）にあり、書き手の承諾なく記事を複製・公衆送信することは禁止されています。このパッケージはタイトル・リンク・日付・見出し画像の URL・本文の冒頭の抜粋を表示します。
- **RSS の取得はビルドのときだけ、必要な回数にとどめてください。** note のサーバーに過度な負担をかけることは、ご利用規約で禁止されています。
- note の仕様が変わると、取得できなくなったり、項目が変わったりすることがあります。

## サポート

この README の範囲までです。個別のご質問や、設置の代行には対応していません。

## ライセンス

[MIT](LICENSE)（Copyright (c) 2026 crossroads inc.）

---

サイトの設置・運用ごと任せたい方は https://press.crssrds.jp/
