# G3_webapp_back_2025

このプロジェクトは Next.js を使った Web アプリケーションのバックエンドです。

## 必要要件

- Node.js 18 以上（推奨: LTS）
- npm もしくは yarn
- PostgreSQL（接続先は `src/lib/db.js` に定義されています）

## クイックスタート（Windows PowerShell）

1) リポジトリを取得し、プロジェクト配下へ移動

```powershell
git clone https://github.com/your-username/G3_webapp_back_2025.git
cd G3_webapp_back_2025/g3-webapp-back-2025
```

2) 依存関係をインストール

```powershell
npm install
# または
yarn install
```

3) 開発モードで起動（ホットリロード）

```powershell
npm run dev
# または
yarn dev
```

ブラウザで http://localhost:3000 を開きます。

### 事前に必要な環境変数（JWT_SECRET）

認証トークン発行に `JWT_SECRET` が必要です。開発環境では `.env.local` を作成してください（Next.js が自動で読み込みます）。

```
# g3-webapp-back-2025/.env.local
JWT_SECRET=dev_change_me_please_1f6f9f5f7d2a4b0c9e3a1c6d8f2b4a6c
```

Windows PowerShell の一時設定でも可:

```powershell
$env:JWT_SECRET="dev_my_secret_123"; npm run dev
```

### ポートを変更したい場合

- 一時的にポートを指定（dev）

```powershell
npm run dev -- -p 3001
```

- 一時的にポートを指定（start）

```powershell
npm run start -- -p 3001
```

- 環境変数で指定（PowerShell）

```powershell
$env:PORT=3001; npm run start
```

## 本番ビルドと起動

1) ビルド

```powershell
npm run build
# または
yarn build
```

2) 本番起動

```powershell
npm run start
# または
yarn start
```

デフォルトでポート 3000 で起動します（上記の方法で変更可能）。

## データベース設定（PostgreSQL）

接続先は `g3-webapp-back-2025/src/lib/db.js` がサーバのIPアドレスから自動判別します。

- サーバIPが `192.168.x.x` の場合 → `host: 192.168.0.20`
- サーバIPが `10.x.x.x` の場合 → `host: 10.100.54.170`

既定の認証情報:
    - user: `nakamura`
    - database: `g3db`
    - password: `g3`
    - port: `5432`

必要に応じて `src/lib/db.js` を編集して接続ポリシーや認証情報を変更できます。

Ubuntu に新規で DB 環境を構築する場合は、以下のガイド/スクリプトを利用してください:
- セットアップガイド: `SQL/setup_for_ubuntu.md`
- 一括セットアップSQL: `SQL/setup_for_ubuntu.sql`

### 初期データ投入（任意）

`SQL/` にスキーマ・テストデータがあります。`psql` が利用可能な環境で以下のように実行できます（接続先は環境に合わせて変更）。

```powershell
# スキーマ作成
psql -h 192.168.0.20 -U nakamura -d g3db -f .\SQL\create.sql

# テストデータ投入
psql -h 192.168.0.20 -U nakamura -d g3db -f .\SQL\testdata.sql
```

Ubuntu では、次の一括セットアップでユーザー/DB作成からスキーマ適用まで自動化できます。

```bash
sudo -u postgres psql -f SQL/setup_for_ubuntu.sql
```

注意: ネットワークや権限で接続できない場合があります。その際は、DB 管理者へ接続情報（ホスト・ポート・DB名・ユーザー・パスワード）の確認を行ってください。

## ファイル構成

```
G3_webapp_back_2025/
├── g3-webapp-back-2025/
│   ├── app/           # ページやAPIルート
│   ├── public/        # 静的ファイル
│   ├── styles/        # CSSファイル
│   ├── package.json   # パッケージ管理
│   ├── next.config.js # Next.js 設定
│   └── ...            # その他設定・ソース
├── README.md          # プロジェクト説明
└── ...
```

## その他

- 環境変数は `.env.local`（開発用）を推奨します。本番ではホスト側の環境変数機能等で安全に設定してください。
- 詳細は各ディレクトリの README やコメント、`SQL/setup_for_ubuntu.md` を参照してください。

## ライセンス

このプロジェクトはMITライセンスです。