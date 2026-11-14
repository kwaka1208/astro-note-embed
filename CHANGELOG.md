# 変更履歴

このパッケージの変更を記録します。書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) にならい、バージョンは [Semantic Versioning](https://semver.org/lang/ja/) に従います。

## [0.2.0] - 2026-11-14

### 変更

- `url`・`thumbnail` は `https:` の URL だけを通すようにした（`javascript:` などを `href` や `src` に出さないため）。`http:` の URL も通らない
- `parseNoteRss` は、RSS として読めない入力に例外を投げるようにした。これまでは空の配列を返していた
- スキーマに通らない記事（日付がないなど）は、警告を出して飛ばすようにした。これまでは `onError` の指定にかかわらずビルドが止まっていた。`fallback` の記事も同じ扱い
- RSS でない応答（お知らせの画面など）と、記事を1件も読み取れない場合を、取得の失敗として扱うようにした
- id が同じ記事が2件以上あるときは、先の記事を残し、後の記事は警告を出して飛ばすようにした。これまでは後の記事で黙って上書きしていた
- `NoteList` の `limit` と `sortNoteArticles` の `limit` は、`0` を 0 件として扱うようにした。これまでは全件になっていた。全件にするには省略する

### 修正

- 数字だけの値が数値に変換されていた（タイトル「007」が「7」になる、本文が数字だけだと例外になる、など）
- 抜粋で文字参照を二重に戻していた（`&amp;lt;` が `<` になる）。10進・16進の数値文字参照も戻すようにした
- 抜粋を絵文字の途中で切って、文字を壊すことがあった。`excerptLength` は見た目の1文字を単位に数える
- `excerptIgnore` に空文字があると、抜粋が1文字ずつ空白で区切られていた

## [0.1.1] - 2026-11-14

### 変更

- 依存する fast-xml-parser を `^5.12.1` 以上にした。5.11.2 以下には、不正な XML で処理が止まるなどの脆弱性がある（GHSA-37qj-frw5-hhjh ほか）

## [0.1.0] - 2026-11-14

### 追加

- `noteMagazineLoader`：note の RSS をビルド時に取得する Content Loader。取得に失敗したときの扱いを `onError`（`fallback`・`empty`・`throw`）で選べる
- `noteArticleSchema`・`NoteArticle`・`parseNoteRss`・`toExcerpt`・`sortNoteArticles`・`formatNoteDate`・`isoNoteDate`
- `NoteList`：記事の一覧。1件分の見た目を `item` で差し替えられる。`live` で自動更新とつなぐ `data-note-*` 属性と `<template>` を出す
- `NoteItem`：記事1件の既定の見た目
- `NoteEmbed`：note 公式の埋め込みで記事を1件表示する
