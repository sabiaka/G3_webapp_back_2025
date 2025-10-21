# 検査用 Python GUI クライアント

このディレクトリには、検査前/検査後のデータと画像を Next.js API に送信するための GUI ツールが含まれます。

- `POST_inspection.py` … 検査前(初期登録)送信用 GUI
- `PUT_inspection.py` … 検査後(結果更新)送信用 GUI

## 事前準備

PowerShell でこのフォルダに移動し、依存をインストールします。

```powershell
cd "c:\Users\sabua\OneDrive\デスクトップ\repo\G3_webapp_back_2025\g3-webapp-back-2025\src\app\api\test\Python"
python -m pip install -r requirements.txt
```

Windows 標準の Python/Tkinter が必要です。もし `tkinter` の import エラーが出る場合は、Python の Tk サポート付きビルドをインストールしてください。

## 使い方

1. Next.js サーバを起動しておきます (例: `http://localhost:3000`)。
2. 以下のいずれかを実行:

```powershell
python .\POST_inspection.py
# または
python .\PUT_inspection.py
```

GUI が立ち上がるので、各項目を入力して送信してください。

- POST: `section_code` は UI で「バネ留め (spring)」「A層検査 (alayer)」から選択できます。
- 画像はファイルダイアログで選べます。
- レスポンスは下部のログに表示されます。
- 入力内容は `g3_inspection_gui_config.json` に保存/復元されます。
- 「現在時刻 (JST) を自動送信」モードがデフォルトONです。OFFにするとJST形式の日時を手動で入力できます。

## API について

- 検査前(POST): `/api/ingress/inspection`
  - multipart/form-data
  - パート `metadata` は JSON、`image` は画像ファイル
  - 成功時 201, `lot_id` と `filename`(public パス) を返します
- 検査後(PUT): `/api/ingress/inspection/result/{filename}`
  - multipart/form-data
  - パート `metadata` は JSON、`image` は任意
  - 成功時 200

サーバ側仕様の詳細はリポジトリ内の `src/app/api/ingress/inspection` 配下の実装を参照してください。