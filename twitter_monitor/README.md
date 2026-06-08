# Twitter ワード通知ツール

指定した Twitter/X アカウントが特定のキーワードを投稿したら、**ntfy.sh** 経由でスマホにプッシュ通知を送ります。

---

## セットアップ

### 1. ntfy アプリをスマホにインストール

- **Android**: [Google Play - ntfy](https://play.google.com/store/apps/details?id=io.heckel.ntfy)
- **iOS**: [App Store - ntfy](https://apps.apple.com/app/ntfy/id1625396347)

インストール後、アプリを開いて「+」ボタンで **トピック名** を登録します（例: `my_twitter_watch_abc123`）。  
トピック名は他人と被らないようにランダムな文字列にしてください（このトピック名を知っている人全員に通知が届くため）。

---

### 2. Twitter/X API の Bearer Token を取得

1. [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard) にアクセス
2. Twitter アカウントでログインし、開発者アカウントを申請
3. **「Create Project」** → プロジェクト名・用途を入力
4. **「Add App」** → アプリ名を入力
5. 表示される **「Bearer Token」** をコピーして保存

> ※ Free プランでも利用可能です。月 500,000 ツイートの読み取りまで無料。

---

### 3. Python 環境を準備

```bash
# Python 3.8以上が必要
cd twitter_monitor
pip install -r requirements.txt
```

---

### 4. 設定ファイルを作成

```bash
cp .env.example .env
```

`.env` を編集して各項目を入力します：

```env
TWITTER_BEARER_TOKEN=取得したBearerToken
TWITTER_USERNAME=監視対象のユーザー名（@なし）
WATCH_KEYWORD=検知したいキーワード
NTFY_TOPIC=ntfyアプリで登録したトピック名
CHECK_INTERVAL_SECONDS=300
```

---

### 5. 実行

```bash
python monitor.py
```

ターミナルを閉じても動かし続けたい場合：

```bash
# バックグラウンド実行（Linux/Mac）
nohup python monitor.py > monitor.log 2>&1 &

# ログ確認
tail -f monitor.log
```

---

## 動作の仕組み

1. `CHECK_INTERVAL_SECONDS` ごとに Twitter API v2 で直近ツイートを検索
2. `from:USERNAME KEYWORD` クエリでヒットしたツイートを取得
3. 新しいツイートがあれば ntfy.sh 経由でスマホに通知
4. 最後に確認したツイート ID を `.last_seen_id` に保存（重複通知防止）

---

## トラブルシューティング

| エラー | 原因と対処 |
|--------|-----------|
| `401 Unauthorized` | Bearer Token が間違っている |
| `429 Rate Limited` | API の制限に達した。`CHECK_INTERVAL_SECONDS` を増やす |
| 通知が届かない | ntfy アプリのトピック名が `.env` の `NTFY_TOPIC` と一致しているか確認 |
