
import os
import json
import datetime
import threading
import tkinter as tk
from tkinter import ttk, messagebox, filedialog

import requests


# =============================
#  検査結果送信 GUI ツール
# =============================

APP_TITLE = "検査結果送信ツール (Jetson GUI)"
DEFAULT_URL = "http://localhost:3001/api/ingress/inspection"
PREFS_FILE = os.path.join(os.path.dirname(__file__), "JetsonGUI_prefs.json")


def iso_utc_now():
  return datetime.datetime.now(datetime.timezone.utc).isoformat()


def iso_utc_now_minus(minutes: int):
  return (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=minutes)).isoformat()


def load_prefs():
  try:
    if os.path.exists(PREFS_FILE):
      with open(PREFS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)
  except Exception:
    pass
  return {}


def save_prefs(data: dict):
  try:
    with open(PREFS_FILE, "w", encoding="utf-8") as f:
      json.dump(data, f, ensure_ascii=False, indent=2)
  except Exception:
    # 保存失敗は致命的ではないので握りつぶす
    pass


class InspectionApp(tk.Tk):
  def __init__(self):
    super().__init__()
    self.title(APP_TITLE)
    self.minsize(720, 520)
    self._build_ui()
    self._load_defaults()

  # ---------- UI 構築 ----------
  def _build_ui(self):
    pad = {"padx": 8, "pady": 6}

    main = ttk.Frame(self)
    main.pack(fill=tk.BOTH, expand=True)

    # 行0: URL
    row0 = ttk.Frame(main)
    row0.pack(fill=tk.X, **pad)
    ttk.Label(row0, text="送信先URL:").pack(side=tk.LEFT)
    self.url_var = tk.StringVar(value=DEFAULT_URL)
    self.url_entry = ttk.Entry(row0, textvariable=self.url_var)
    self.url_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=8)
    ttk.Button(row0, text="デフォルト", command=lambda: self.url_var.set(DEFAULT_URL)).pack(side=tk.LEFT)

    # 行1: camera_id / product_id
    row1 = ttk.Frame(main)
    row1.pack(fill=tk.X, **pad)
    ttk.Label(row1, text="カメラID:").grid(row=0, column=0, sticky=tk.W)
    self.camera_var = tk.StringVar()
    ttk.Entry(row1, textvariable=self.camera_var, width=20).grid(row=0, column=1, sticky=tk.W, padx=(4, 16))
    ttk.Label(row1, text="製品ID:").grid(row=0, column=2, sticky=tk.W)
    self.product_var = tk.StringVar()
    ttk.Entry(row1, textvariable=self.product_var, width=28).grid(row=0, column=3, sticky=tk.W, padx=(4, 8))
    ttk.Button(row1, text="次の製品IDを取得", command=self._fetch_next_product_id).grid(row=0, column=4, sticky=tk.W)

    # 行2: result (pass/fail) / reason
    row2 = ttk.Frame(main)
    row2.pack(fill=tk.X, **pad)
    ttk.Label(row2, text="判定:").grid(row=0, column=0, sticky=tk.W)
    self.result_var = tk.StringVar(value="pass")
    ttk.Radiobutton(row2, text="PASS", value="pass", variable=self.result_var, command=self._on_result_change).grid(row=0, column=1, sticky=tk.W)
    ttk.Radiobutton(row2, text="FAIL", value="fail", variable=self.result_var, command=self._on_result_change).grid(row=0, column=2, sticky=tk.W, padx=(0, 16))

    ttk.Label(row2, text="理由(FAIL時):").grid(row=0, column=3, sticky=tk.W)
    self.reason_var = tk.StringVar()
    self.reason_choices = [
        "糸ほつれ",
        "汚れ",
        "ゴミ",
        "その他"
    ]
    self.reason_combo = ttk.Combobox(row2, textvariable=self.reason_var, values=self.reason_choices, state="readonly", width=38)
    self.reason_combo.grid(row=0, column=4, sticky=tk.W)
    self.reason_combo.configure(state="disabled")  # 初期はPASSなのでグレーアウト

    # 行3: captured_at / inspected_at
    row3 = ttk.Frame(main)
    row3.pack(fill=tk.X, **pad)
    ttk.Label(row3, text="撮影時刻 (captured_at, UTC ISO):").grid(row=0, column=0, sticky=tk.W)
    self.captured_var = tk.StringVar()
    cap_entry = ttk.Entry(row3, textvariable=self.captured_var)
    cap_entry.grid(row=0, column=1, sticky=tk.EW, padx=(4, 8))
    row3.grid_columnconfigure(1, weight=1)
    ttk.Button(row3, text="今-3分", command=lambda: self.captured_var.set(iso_utc_now_minus(3))).grid(row=0, column=2)
    ttk.Button(row3, text="現在(UTC)", command=lambda: self.captured_var.set(iso_utc_now())).grid(row=0, column=3)

    ttk.Label(row3, text="検査時刻 (inspected_at, UTC ISO):").grid(row=1, column=0, sticky=tk.W, pady=(6, 0))
    self.inspected_var = tk.StringVar()
    ins_entry = ttk.Entry(row3, textvariable=self.inspected_var)
    ins_entry.grid(row=1, column=1, sticky=tk.EW, padx=(4, 8), pady=(6, 0))
    ttk.Button(row3, text="現在(UTC)", command=lambda: self.inspected_var.set(iso_utc_now())).grid(row=1, column=2, pady=(6, 0))

    # 行4: 画像ファイル選択
    row4 = ttk.Frame(main)
    row4.pack(fill=tk.X, **pad)
    ttk.Label(row4, text="画像ファイル:").pack(side=tk.LEFT)
    self.image_path_var = tk.StringVar()
    self.image_entry = ttk.Entry(row4, textvariable=self.image_path_var)
    self.image_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=8)
    ttk.Button(row4, text="参照...", command=self._choose_image).pack(side=tk.LEFT)

    # 行5: 送信ボタン
    row5 = ttk.Frame(main)
    row5.pack(fill=tk.X, **pad)
    self.send_btn = ttk.Button(row5, text="送信", command=self._on_send)
    self.send_btn.pack(side=tk.LEFT)
    ttk.Button(row5, text="クリア", command=self._on_clear).pack(side=tk.LEFT, padx=(8, 0))

    self.status_var = tk.StringVar(value="準備完了")
    ttk.Label(row5, textvariable=self.status_var, foreground="#2a5").pack(side=tk.RIGHT)

    # 行6: レスポンス表示
    row6 = ttk.LabelFrame(main, text="レスポンス")
    row6.pack(fill=tk.BOTH, expand=True, **pad)
    self.response_text = tk.Text(row6, height=12, wrap=tk.NONE)
    self.response_text.pack(fill=tk.BOTH, expand=True)
    
    # 初期状態を現在の判定に合わせて同期
    self._on_result_change()

  # ---------- デフォルト値 ----------
  def _load_defaults(self):
    prefs = load_prefs()
    self.camera_var.set(prefs.get("camera_id", "cam-a"))
    self.product_var.set(prefs.get("product_id", "A-102-002"))
    self.result_var.set(prefs.get("result", "pass"))
    self.reason_var.set(prefs.get("reason", ""))
    self.captured_var.set(prefs.get("captured_at", iso_utc_now_minus(3)))
    self.inspected_var.set(prefs.get("inspected_at", iso_utc_now()))
    self.image_path_var.set(prefs.get("image_path", ""))
    self.url_var.set(prefs.get("url", DEFAULT_URL))

  def _persist_prefs(self):
    data = {
      "camera_id": self.camera_var.get(),
      "product_id": self.product_var.get(),
      "result": self.result_var.get(),
      "reason": self.reason_var.get(),
      "captured_at": self.captured_var.get(),
      "inspected_at": self.inspected_var.get(),
      "image_path": self.image_path_var.get(),
      "url": self.url_var.get(),
    }
    save_prefs(data)

  # -----------------
  # 製品IDの自動割り当て
  # -----------------
  def _camera_prefix(self, camera_id: str) -> str:
    # カメラIDから製品IDのプレフィックスを推測する簡易ルール
    # 例: cam-a -> A-
    if not camera_id:
      return ""
    s = camera_id.strip().lower()
    if s.startswith("cam-") and len(s) >= 5:
      return s[4].upper() + "-"
    # フォールバック: 先頭文字を大文字化して末尾にハイフン
    return camera_id.strip()[0].upper() + "-"

  def _parse_trailing_number(self, product_id: str) -> int:
    # product_id 末尾の連番を抽出 (例 A-102-002 -> 2 )
    if not product_id:
      return 0
    # 最後のハイフン区切りを数値としてパース
    parts = product_id.split("-")
    for p in reversed(parts):
      try:
        return int(p)
      except Exception:
        continue
    return 0

  def _format_next_product(self, prefix: str, base_product: str) -> str:
    # base_product を解析して次の番号を作る。幅は元の桁幅を尊重
    if base_product:
      parts = base_product.split("-")
      # 末尾の数の桁幅
      trailing = self._parse_trailing_number(base_product)
      if trailing > 0:
        last_part = parts[-1]
        width = len(last_part)
        next_num = trailing + 1
        return prefix + str(next_num).zfill(width)
    # フォールバック: 1 を付与
    return prefix + "001"

  def _fetch_next_product_id(self):
    # サーバに問い合わせて、同カメラの最新の product_id を取得し、次の連番をセットする
    camera_id = self.camera_var.get().strip()
    url = self.url_var.get().strip()
    if not camera_id:
      messagebox.showwarning("入力エラー", "カメラIDを入力してください")
      return

    # API: GET /api/inspections?type=alayer|spring ... を利用
    # camera_id から type を推測（簡易）
    type_alias = None
    if camera_id.lower().startswith("cam-a"):
      type_alias = "alayer"
    elif camera_id.lower().startswith("cam-b"):
      type_alias = "spring"

    # target URL のベースを作成
    try:
      base = url.split('/api/')[0]
      fetch_url = base + "/api/inspections"
    except Exception:
      fetch_url = "http://localhost:3001/api/inspections"

    params = {}
    if type_alias:
      params['type'] = type_alias

    # 非同期で取得してUIをブロックしない
    def _worker():
      try:
        res = requests.get(fetch_url, params=params, timeout=10)
        if res.status_code == 200:
          data = res.json()
          logs = data.get('logs', [])
          latest_product = None
          if logs:
            latest_product = logs[0].get('product_id')
          # フォールバック: prefs ファイル
          if not latest_product:
            prefs = load_prefs()
            latest_product = prefs.get('product_id')

          prefix = self._camera_prefix(camera_id)
          next_product = self._format_next_product(prefix, latest_product)
          self.after(0, lambda: self.product_var.set(next_product))
        else:
          # 失敗時は prefs を参照
          prefs = load_prefs()
          latest_product = prefs.get('product_id')
          prefix = self._camera_prefix(camera_id)
          next_product = self._format_next_product(prefix, latest_product)
          self.after(0, lambda: self.product_var.set(next_product))
      except Exception as e:
        prefs = load_prefs()
        latest_product = prefs.get('product_id')
        prefix = self._camera_prefix(camera_id)
        next_product = self._format_next_product(prefix, latest_product)
        self.after(0, lambda: self.product_var.set(next_product))

    threading.Thread(target=_worker, daemon=True).start()

  def _on_result_change(self):
    # 判定切替時に理由コンボの有効/無効を制御
    if getattr(self, "reason_combo", None) is None:
      return
    if self.result_var.get() == "fail":
      self.reason_combo.configure(state="readonly")
    else:
      self.reason_combo.set("")
      self.reason_combo.configure(state="disabled")

  # ---------- ハンドラ ----------
  def _choose_image(self):
    path = filedialog.askopenfilename(
      title="検査画像を選択",
      filetypes=[
        ("画像ファイル", "*.jpg;*.jpeg;*.png;*.bmp"),
        ("すべてのファイル", "*.*"),
      ],
    )
    if path:
      self.image_path_var.set(path)

  def _on_clear(self):
    self.response_text.delete("1.0", tk.END)
    self.status_var.set("クリアしました")

  def _validate(self):
    # 必須: URL, camera_id, product_id, result, captured_at, inspected_at, image_path
    if not self.url_var.get().strip():
      return False, "送信先URLを入力してください"
    if not self.camera_var.get().strip():
      return False, "カメラIDを入力してください"
    if not self.product_var.get().strip():
      return False, "製品IDを入力してください"
    if self.result_var.get() not in ("pass", "fail"):
      return False, "判定は pass または fail を選択してください"
    if self.result_var.get() == "fail" and not self.reason_var.get().strip():
      return False, "FAILのときは理由を入力してください"
    if not self.captured_var.get().strip():
      return False, "captured_at を入力してください"
    if not self.inspected_var.get().strip():
      return False, "inspected_at を入力してください"
    img = self.image_path_var.get().strip()
    if not img:
      return False, "画像ファイルを選択してください"
    if not os.path.exists(img):
      return False, "画像ファイルが存在しません"
    return True, ""

  def _on_send(self):
    ok, msg = self._validate()
    if not ok:
      messagebox.showwarning("入力エラー", msg)
      return

    # inspected_at は送信直前に現在時刻に更新するオプション（UX的に便利）
    if messagebox.askyesno("確認", "inspected_at を現在時刻(UTC)に更新して送信しますか？"):
      self.inspected_var.set(iso_utc_now())

    # 非同期送信
    self.send_btn.config(state=tk.DISABLED)
    self.status_var.set("送信中...")
    self.response_text.delete("1.0", tk.END)

    self._persist_prefs()

    thread = threading.Thread(target=self._post_request, daemon=True)
    thread.start()

  def _post_request(self):
    url = self.url_var.get().strip()
    metadata = {
      "camera_id": self.camera_var.get().strip(),
      "product_id": self.product_var.get().strip(),
      "result": self.result_var.get().strip(),
      "reason": self.reason_var.get().strip(),
      "captured_at": self.captured_var.get().strip(),
      "inspected_at": self.inspected_var.get().strip(),
    }
    img_path = self.image_path_var.get().strip()

    try:
      with open(img_path, "rb") as f:
        files = {
          "metadata": (None, json.dumps(metadata, ensure_ascii=False), "application/json"),
          # サーバ側の期待に合わせてフィールド名は 'image_file'
          "image_file": (os.path.basename(img_path), f, "application/octet-stream"),
        }
        res = requests.post(url, files=files, timeout=30)

      try:
        payload = res.json()
        body_str = json.dumps(payload, ensure_ascii=False, indent=2)
      except Exception:
        body_str = (res.text or "").strip()

      out = [
        f"ステータス: {res.status_code}",
        "--- レスポンス本文 ---",
        body_str,
      ]
      self._update_response("\n".join(out), success=(200 <= res.status_code < 300))

    except requests.exceptions.RequestException as e:
      self._update_response(f"送信に失敗しました: {e}", success=False)
    except OSError as e:
      self._update_response(f"画像ファイルの読み込みに失敗しました: {e}", success=False)
    finally:
      self._enable_send_button()

  def _update_response(self, text: str, success: bool):
    def _apply():
      self.response_text.delete("1.0", tk.END)
      self.response_text.insert(tk.END, text)
      self.status_var.set("送信成功" if success else "送信失敗")
    self.after(0, _apply)

  def _enable_send_button(self):
    self.after(0, lambda: self.send_btn.config(state=tk.NORMAL))


def main():
  app = InspectionApp()
  app.mainloop()


if __name__ == "__main__":
  main()