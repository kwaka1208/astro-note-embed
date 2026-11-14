# 変更履歴

このパッケージの変更を記録します。書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) にならい、バージョンは [Semantic Versioning](https://semver.org/lang/ja/) に従います。

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
