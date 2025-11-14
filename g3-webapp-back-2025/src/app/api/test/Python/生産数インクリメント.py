import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext
import requests
import json
import sys

# /c:/Users/sabua/OneDrive/デスクトップ/repo/G3_webapp_back_2025/g3-webapp-back-2025/src/app/api/test/Python/生産数インクリメント.py
# GitHub Copilot
# シンプルなGUIクライアント: 指定の機械に対して生産数インクリメントAPIを叩き、lot_idを表示・クリップボードへコピーできる


# 設定
BASE_URL_CHOICES = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://10.100.54.170:3001",
]
DEFAULT_BASE_URL = BASE_URL_CHOICES[0]
SECTIONS = ["spring", "alayer"]

def increment_production():
    base_url = base_url_var.get().strip().rstrip("/")
    machine_id = entry_machine.get().strip()
    section = combo_section.get().strip()
    token = entry_token.get().strip()

    if not machine_id:
        messagebox.showwarning("入力エラー", "machine id を入力してください。")
        return
    if section not in SECTIONS:
        messagebox.showwarning("入力エラー", "section は必須です。spring または alayer を選択してください。")
        return

    url = f"{base_url}/api/machines/{machine_id}/increment-production"
    params = {"section": section}
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    btn_increment.config(state="disabled")
    txt_output.delete("1.0", tk.END)
    txt_output.insert(tk.END, f"POST {url} ?section={section}\n\n")
    root.update_idletasks()

    try:
        resp = requests.post(url, params=params, headers=headers, timeout=10)
    except requests.RequestException as e:
        txt_output.insert(tk.END, f"通信エラー: {e}\n")
        messagebox.showerror("通信エラー", "サーバーに接続できませんでした。URLやネットワークを確認してください。")
        btn_increment.config(state="normal")
        return

    try:
        data = resp.json()
    except ValueError:
        data = None

    if resp.status_code == 200 and isinstance(data, dict):
        # 期待レスポンス例:
        # { "today_production_count": 1521, "lot_id": "MAT-00123" }
        today = data.get("today_production_count")
        lot_id = data.get("lot_id")
        txt_output.insert(tk.END, f"ステータス: {resp.status_code} OK\n\n")
        txt_output.insert(tk.END, json.dumps(data, ensure_ascii=False, indent=2))
        if lot_id:
            btn_copy.config(state="normal")
            lbl_last_lot.config(text=f"lot_id: {lot_id}")
        else:
            btn_copy.config(state="disabled")
            lbl_last_lot.config(text="lot_id: -")
        messagebox.showinfo("成功", "生産数をインクリメントしました。")
    else:
        btn_copy.config(state="disabled")
        lbl_last_lot.config(text="lot_id: -")
        txt_output.insert(tk.END, f"エラー ステータス: {resp.status_code}\n")
        if data:
            # 可能ならサーバーの返すエラーメッセージを表示（日本語であることが期待される）
            txt_output.insert(tk.END, json.dumps(data, ensure_ascii=False, indent=2))
            # 一般的なメッセージボックスは日本語で
            messagebox.showerror("APIエラー", "サーバーがエラーを返しました。詳細は出力を確認してください。")
        else:
            txt_output.insert(tk.END, resp.text)
            messagebox.showerror("APIエラー", f"ステータスコード {resp.status_code}")

    btn_increment.config(state="normal")

def copy_lot_to_clipboard():
    # 出力エリアやラベルからlot_idを取得してクリップボードへ
    text = lbl_last_lot.cget("text")
    if text and text.startswith("lot_id: "):
        lot = text[len("lot_id: "):]
        root.clipboard_clear()
        root.clipboard_append(lot)
        messagebox.showinfo("コピー完了", f"lot_id をクリップボードにコピーしました: {lot}")
    else:
        messagebox.showwarning("コピー失敗", "コピーする lot_id が見つかりません。")

def on_close():
    try:
        root.clipboard_clear()
    except:
        pass
    root.destroy()

# GUI構築
root = tk.Tk()
root.title("生産数インクリメントクライアント")
root.geometry("700x480")

frm = ttk.Frame(root, padding=10)
frm.pack(fill=tk.BOTH, expand=True)

# サーバー (選択可能 + 編集可)
ttk.Label(frm, text="Base URL:").grid(column=0, row=0, sticky=tk.W)
base_url_var = tk.StringVar(value=DEFAULT_BASE_URL)
combo_base = ttk.Combobox(frm, textvariable=base_url_var, values=BASE_URL_CHOICES, width=50)
combo_base.grid(column=1, row=0, columnspan=3, sticky=tk.W, pady=2)

# トークン
ttk.Label(frm, text="Bearer Token (任意):").grid(column=0, row=1, sticky=tk.W)
entry_token = ttk.Entry(frm, width=50, show="*")
entry_token.grid(column=1, row=1, columnspan=3, sticky=tk.W, pady=2)

# Machine ID
ttk.Label(frm, text="Machine ID:").grid(column=0, row=2, sticky=tk.W)
entry_machine = ttk.Entry(frm, width=20)
entry_machine.grid(column=1, row=2, sticky=tk.W, pady=2)

# Section
ttk.Label(frm, text="Section:").grid(column=2, row=2, sticky=tk.W)
combo_section = ttk.Combobox(frm, values=SECTIONS, state="readonly", width=12)
combo_section.set(SECTIONS[0])
combo_section.grid(column=3, row=2, sticky=tk.W, pady=2)

# Buttons
btn_increment = ttk.Button(frm, text="インクリメント実行", command=increment_production)
btn_increment.grid(column=1, row=3, sticky=tk.W, pady=8)

btn_copy = ttk.Button(frm, text="lot_id をコピー", command=copy_lot_to_clipboard, state="disabled")
btn_copy.grid(column=2, row=3, sticky=tk.W, pady=8)

lbl_last_lot = ttk.Label(frm, text="lot_id: -")
lbl_last_lot.grid(column=3, row=3, sticky=tk.W, pady=8)

# 出力
ttk.Label(frm, text="APIレスポンス:").grid(column=0, row=4, sticky=tk.W)
txt_output = scrolledtext.ScrolledText(frm, width=80, height=20)
txt_output.grid(column=0, row=5, columnspan=4, pady=4)

# 最後の調整
for child in frm.winfo_children():
    child.grid_configure(padx=5, pady=2)

root.protocol("WM_DELETE_WINDOW", on_close)

if __name__ == "__main__":
    try:
        root.mainloop()
    except KeyboardInterrupt:
        sys.exit(0)