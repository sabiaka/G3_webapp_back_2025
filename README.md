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

接続設定は `g3-webapp-back-2025/src/lib/db.js` にハードコードされています。
既定値:
    - user: `nakamura`
    - host: `10.100.54.170`
    - database: `g3db`
    - password: `g3`
    - port: `5432`

必要に応じて `src/lib/db.js` を編集してください。

### 初期データ投入（任意）

リポジトリ直下の `SQL/` にスキーマやテストデータがあります。`psql` が利用可能な環境で以下のように実行できます。

```powershell
# スキーマ作成
psql -h 10.100.54.170 -U nakamura -d g3db -f .\SQL\create.sql

# テストデータ投入
psql -h 10.100.54.170 -U nakamura -d g3db -f .\SQL\testdata.sql
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

- `.env` ファイルを作成して環境変数を設定できます。
- 詳細は各ディレクトリの README やコメントを参照してください。

## ライセンス

このプロジェクトはMITライセンスです。