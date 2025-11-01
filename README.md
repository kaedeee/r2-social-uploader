---
# R2 → Instagram / YouTube / Facebook / IFTTT Auto Poster

Cloudflare R2 にアップロードした動画を、**毎時（JST 日中）に 1 本ずつ Instagram、YouTube、Facebook Pages、IFTTT（Threads）に自動投稿し、投稿後は削除する** GitHub Actions Bot です。
複数アカウント対応：**Instagram 3 アカウント**、**YouTube 2 アカウント**、**Facebook Pages**をランダムに使い分けます。
---

## 機能概要

- **動画ソース**: Cloudflare R2（Public URL / r2.dev）
- **スケジュール**: GitHub Actions の cron（毎時、JST 10〜18 時）
- **Instagram**: Graph API を利用し投稿（キャプション＝ファイル名）
- **YouTube**: Data API v3 を利用し投稿（タイトル/説明＝ファイル名）
- **Facebook Pages**: Reels Publishing API を利用しリール投稿（説明＝ファイル名）
- **ファイル名 → メタデータ**

  - `_` → スペースに変換
  - 拡張子除去
  - **Instagram キャプション**: ファイル名全文
  - **YouTube タイトル**: 先頭 100 文字
  - **YouTube 説明**: ファイル名全文

- **削除ポリシー**: IG/FB/YouTube/IFTTT 全て成功したら R2 から削除。一つでも失敗なら保持して再挑戦。
- **プレフィックス制御**:
  - `YT_IG_SK`: YouTube、Instagram、Facebook をスキップ（IFTTT のみ）
  - `YT_SK`: YouTube のみスキップ（Instagram、Facebook、IFTTT は実行）
  - `ROB_`: ROB 用の Instagram アカウント（とFacebook Page）を使用、YouTube をスキップ

---

## 前提条件

- **Cloudflare アカウント**（R2 有効化）
- **Instagram プロアカウント**（ビジネス/クリエイター）
- **YouTube アカウント（3 つ）**

  - Google Cloud Console で OAuth クライアント作成
  - 各チャンネルごとに `refresh_token` を取得

---

## セットアップ

### 1. R2 の準備

1. Cloudflare ダッシュボード → **R2 → Create bucket**
   例: `ig-yt-media`
2. **Public access** をオンにする
   （今回は `https://<bucket>.r2.dev` を利用）
3. **API Token** を発行（Read/Write）

### 2. GitHub Secrets の設定

リポジトリ → Settings → Secrets and variables → Actions に以下を登録:

#### R2

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET` = `ig-yt-media`
- `R2_PUBLIC_BASE_URL` = `https://ig-yt-media.r2.dev`

#### Instagram（3 アカ）

- `IG_ACCOUNTS`（JSON）

```json
[
  { "userId": "1789xxxxxxxxxxxx1", "accessToken": "EAAG...1" },
  { "userId": "1789xxxxxxxxxxxx2", "accessToken": "EAAG...2" },
  { "userId": "1789xxxxxxxxxxxx3", "accessToken": "EAAG...3" }
]
```

#### ROB用アカウント（オプション）

ファイル名に `ROB_` プレフィックスが付いている場合に使用されます。

- `ROB_IG_ACCOUNT`（JSON）

```json
{ "userId": "1789xxxxxxxxxxxx", "accessToken": "EAAG..." }
```

- `ROB_FB_PAGE`（JSON、オプション）

```json
{ "pageId": "123456789012345", "accessToken": "EAAG..." }
```

**注意：** `ROB_` プレフィックスが付いているファイルは、通常のInstagramアカウントリストからランダムに選ばれる代わりに `ROB_IG_ACCOUNT` を使用し、YouTubeはスキップされます。`ROB_FB_PAGE` が設定されている場合は、それも使用されます。

#### YouTube（3 アカ）

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `YT_ACCOUNTS`（JSON）

```json
[{ "refreshToken": "1//0g...Aa" }, { "refreshToken": "1//0h...Bb" }]
```

**YouTube リフレッシュトークンの取得方法：**

1. **Google Cloud Console で OAuth クライアントを作成**

   - Google Cloud Console → 認証情報 → OAuth 2.0 クライアント ID を作成
   - アプリケーションの種類: 「デスクトップアプリケーション」
   - リダイレクト URI: `http://localhost:3000`

2. **リフレッシュトークンを生成**

   ```bash
   # 環境変数を設定（.envファイルまたは直接設定）
   export GOOGLE_CLIENT_ID="your_client_id"
   export GOOGLE_CLIENT_SECRET="your_client_secret"

   # リフレッシュトークンを生成
   node test/youtube_refresh_token.mjs
   ```

3. **手順**
   - コマンド実行後、表示される URL をブラウザで開く
   - YouTube アカウントでログイン・承認
   - 表示される認可コードをターミナルに貼り付け
   - 取得した `refresh_token` を `YT_ACCOUNTS` に追加

**注意：** 各 YouTube チャンネルごとに個別にリフレッシュトークンを取得する必要があります。

#### Facebook Pages（オプション）

- `FB_PAGES`（JSON）

```json
[
  { "pageId": "123456789012345", "accessToken": "EAAG..." },
  { "pageId": "987654321098765", "accessToken": "EAAG..." }
]
```

**Facebook Pages アクセストークンの取得方法：**

1. **Facebook Developer Console でアプリを作成**
   - https://developers.facebook.com/apps/
   - 新しいアプリを作成

2. **必要な権限を追加**
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`

3. **ページアクセストークンを取得**
   - Graph API Explorer または OAuth フローを使用
   - ページ ID とアクセストークンを取得

**注意：** `YT_IG_SK` プレフィックスが付いているファイルは、Facebook への投稿もスキップされます。

#### IFTTT（Threads）

- `IFTTT_WEBHOOK_KEY` = `b-XXX`
- `IFTTT_EVENT_NAME` = `r2_to_threads`（デフォルト値）

#### オプション

- `POST_WINDOW_JST` = `"10-18"`（投稿する時間帯）
- `YT_DAILY_LIMIT` = `"6"`（YouTube の 1 日上限）
- `DRY_RUN` = `"1"`（テスト時、投稿/削除を実行せずログのみ）

---

## ワークフロー

`.github/workflows/post-every-hour.yml`

```yaml
name: R2 → IG/YouTube hourly

on:
  schedule:
    # JST 10:00〜18:00 を毎時実行 (UTC換算: 1〜9時)
    - cron: "0 1-9 * * *"
  workflow_dispatch: {}

jobs:
  post:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npm run post
        env:
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_BUCKET: ${{ secrets.R2_BUCKET }}
          R2_PUBLIC_BASE_URL: ${{ secrets.R2_PUBLIC_BASE_URL }}
          IG_ACCOUNTS: ${{ secrets.IG_ACCOUNTS }}
          GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
          GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}
          YT_ACCOUNTS: ${{ secrets.YT_ACCOUNTS }}
          FB_PAGES: ${{ secrets.FB_PAGES }}
          IFTTT_WEBHOOK_KEY: ${{ secrets.IFTTT_WEBHOOK_KEY }}
          IFTTT_EVENT_NAME: "r2_to_threads"
          POST_WINDOW_JST: "10-18"
          YT_DAILY_LIMIT: "6"
```

---

## 動作の流れ

1. R2 バケット直下から動画を 1 本ピックアップ
2. ファイル名 → キャプション/タイトル/説明を生成
3. IG アカウント（3 つからランダム）、FB Pages（設定されている場合）、YT アカウント（2 つからランダム）、IFTTT（Threads）に投稿
4. 全て成功したら R2 から削除。一つでも失敗したら残して次回再挑戦

---

## 制約

- **Instagram API**: 24 時間で最大 100 件まで
- **Facebook Reels API**: 24 時間で最大 30 件まで
- **YouTube API**: 1 動画=1600 クォータ、1 日 1 万まで（安全圏は 6 本/日）
- **ファイル形式**: mp4 (H.264/AAC) 必須。`Content-Type: video/mp4` で保存されていること
- **Facebook Reels の動画仕様**:
  - アスペクト比: 9:16
  - 解像度: 1080x1920（推奨）、最小 540x960
  - フレームレート: 24-60 fps
  - 長さ: 3-90 秒

---

## 開発メモ

- ファイル名に `_` を使うとスペースに変換されます
- DRY_RUN=1 でテスト実行可能（投稿せずログのみ）
- 将来的に「ハッシュタグ抽出」「アカウントごとの重み付き投稿」も簡単に追加できます

---
