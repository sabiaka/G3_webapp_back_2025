# 検査結果送信 GUI ツール

このフォルダの `Jetson_Sample.py` は、検査結果をAPIへ送信するためのTkinterベースのGUIツールです。

## 必要要件
- Python 3.9+（Windows/Jetson いずれも可）
- パッケージ: requests

インストール:

```powershell
python -m pip install -r requirements.txt
```

## 使い方
1. Next.js API サーバーを起動（デフォルト: http://localhost:3001）。
2. GUIを起動:
   ```powershell
   python .\Jetson_Sample.py
   ```
3. 次の項目を入力/選択:
   - 送信先URL
   - カメラID / 製品ID
   - 判定（PASS/FAIL）と理由（FAIL時必須）
   - captured_at / inspected_at（UTC ISO形式）
   - 画像ファイル
4. 送信を押すと multipart/form-data で `metadata` と `image_file` をPOSTします。

## メモ
- 入力内容は `JetsonGUI_prefs.json` に保存され、次回起動時に復元されます。
- inspected_at は送信直前に「現在に更新」する確認が表示されます。
- タイムアウトは30秒に設定しています（`requests.post(..., timeout=30)`）。