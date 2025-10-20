
import json
import datetime as dt
import threading
import os
import mimetypes
import requests
import tkinter as tk
from tkinter import ttk, filedialog, messagebox


CONFIG_FILE = os.path.join(os.path.dirname(__file__), 'g3_inspection_gui_config.json')


def now_jst_iso():
    tz = dt.timezone(dt.timedelta(hours=9), name='JST')
    return dt.datetime.now(tz).isoformat()


def load_config():
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def save_config(data: dict):
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                cur = json.load(f)
        else:
            cur = {}
        cur.update(data)
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(cur, f, ensure_ascii=False, indent=2)
    except Exception:
        # 設定保存失敗は致命的ではないので黙殺
        pass


class PostInspectionGUI(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title('検査前データ 送信ツール (POST /api/ingress/inspection)')
        self.geometry('760x560')

        self._build_widgets()
        self._load_initial_values()

        self.protocol('WM_DELETE_WINDOW', self.on_close)

    def _build_widgets(self):
        pad = {'padx': 8, 'pady': 6}

        frm = ttk.Frame(self)
        frm.pack(fill=tk.BOTH, expand=True)

        # URL
        ttk.Label(frm, text='サーバURL').grid(row=0, column=0, sticky='e', **pad)
        self.url_var = tk.StringVar()
        self.url_entry = ttk.Entry(frm, textvariable=self.url_var, width=70)
        self.url_entry.grid(row=0, column=1, columnspan=2, sticky='we', **pad)

        # section_code (UI 表示は日本語、送信値は英語コードにマップ)
        ttk.Label(frm, text='工程 (section_code)').grid(row=1, column=0, sticky='e', **pad)
        self.section_map = {
            'バネ留め (spring)': 'spring',
            'A層検査 (alayer)': 'alayer',
        }
        self.section_var = tk.StringVar()
        self.section_combo = ttk.Combobox(frm, textvariable=self.section_var, values=list(self.section_map.keys()), state='readonly', width=30)
        self.section_combo.grid(row=1, column=1, sticky='w', **pad)

        # camera_id
        ttk.Label(frm, text='カメラID (camera_id)').grid(row=2, column=0, sticky='e', **pad)
        self.camera_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.camera_var, width=30).grid(row=2, column=1, sticky='w', **pad)

        # shot_seq
        ttk.Label(frm, text='ショット番号 (shot_seq)').grid(row=3, column=0, sticky='e', **pad)
        self.shot_var = tk.IntVar(value=1)
        ttk.Spinbox(frm, from_=1, to=99999, textvariable=self.shot_var, width=10).grid(row=3, column=1, sticky='w', **pad)
        # 現在時刻を自動送信トグル（JST）
        self.send_now_var = tk.BooleanVar(value=True)
        self.send_now_chk = ttk.Checkbutton(frm, text='現在時刻 (JST) を自動送信', variable=self.send_now_var, command=self._on_send_now_toggle)
        self.send_now_chk.grid(row=4, column=0, columnspan=3, sticky='w', **pad)

        # captured_at (手動入力時のみ使用)
        ttk.Label(frm, text='撮影日時 (captured_at, JST ISO)').grid(row=5, column=0, sticky='e', **pad)
        self.captured_var = tk.StringVar()
        self.cap_entry = ttk.Entry(frm, textvariable=self.captured_var, width=40)
        self.cap_entry.grid(row=5, column=1, sticky='w', **pad)
        self.set_now_btn = ttk.Button(frm, text='現在時刻をセット', command=lambda: self.captured_var.set(now_jst_iso()))
        self.set_now_btn.grid(row=5, column=2, sticky='w', **pad)

        # image
        ttk.Label(frm, text='検査前画像 (image)').grid(row=6, column=0, sticky='e', **pad)
        self.image_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.image_var, width=50).grid(row=6, column=1, sticky='we', **pad)
        ttk.Button(frm, text='参照...', command=self._browse_image).grid(row=6, column=2, sticky='w', **pad)

        # buttons
        btn_frame = ttk.Frame(frm)
        btn_frame.grid(row=7, column=0, columnspan=3, sticky='w', padx=8, pady=(4, 8))
        self.send_btn = ttk.Button(btn_frame, text='送信', command=self.on_send)
        self.send_btn.pack(side=tk.LEFT, padx=(0, 8))
        ttk.Button(btn_frame, text='クリア', command=self.on_clear).pack(side=tk.LEFT)

        # log
        ttk.Label(frm, text='レスポンス / ログ').grid(row=8, column=0, sticky='ne', **pad)
        self.log = tk.Text(frm, height=16, wrap='word')
        self.log.grid(row=8, column=1, columnspan=2, sticky='nsew', **pad)
        scroll = ttk.Scrollbar(frm, command=self.log.yview)
        self.log['yscrollcommand'] = scroll.set
        scroll.grid(row=8, column=3, sticky='ns')

        # grid config
        frm.grid_columnconfigure(1, weight=1)
        frm.grid_rowconfigure(8, weight=1)

    def _load_initial_values(self):
        cfg = load_config()
        # Defaults
        self.url_var.set(cfg.get('post_url', 'http://localhost:3000/api/ingress/inspection'))
        self.section_var.set(cfg.get('post_section_label', 'バネ留め (spring)'))
        if self.section_var.get() not in self.section_map:
            self.section_var.set('バネ留め (spring)')
        self.camera_var.set(cfg.get('camera_id', 'B-spring01'))
        self.shot_var.set(int(cfg.get('shot_seq', 1)))
        self.captured_var.set(cfg.get('captured_at', now_jst_iso()))
        self.send_now_var.set(bool(cfg.get('post_send_now_jst', True)))
        self._on_send_now_toggle()
        self.image_var.set(cfg.get('post_image_path', ''))

    def _browse_image(self):
        path = filedialog.askopenfilename(title='検査前画像を選択', filetypes=[('画像ファイル', '*.jpg;*.jpeg;*.png;*.bmp;*.gif'), ('すべてのファイル', '*.*')])
        if path:
            self.image_var.set(path)

    def append_log(self, text: str):
        self.log.insert(tk.END, text + '\n')
        self.log.see(tk.END)

    def on_clear(self):
        self.log.delete('1.0', tk.END)

    def set_ui_enabled(self, enabled: bool):
        state = tk.NORMAL if enabled else tk.DISABLED
        self.send_btn.config(state=state)

    def on_send(self):
        # validate
        url = self.url_var.get().strip()
        section_label = self.section_var.get()
        section_code = self.section_map.get(section_label)
        camera_id = self.camera_var.get().strip()
        shot_seq = int(self.shot_var.get())
        captured_at = self.captured_var.get().strip()
        image_path = self.image_var.get().strip()

        if not url:
            messagebox.showerror('入力エラー', 'サーバURLは必須です。')
            return
        if not section_code:
            messagebox.showerror('入力エラー', '工程を選択してください。')
            return
        if not camera_id:
            messagebox.showerror('入力エラー', 'camera_id は必須です。')
            return
        # captured_at（モードにより検証）
        if not self.send_now_var.get():
            if not captured_at:
                messagebox.showerror('入力エラー', 'captured_at は必須です（自動送信をOFFにした場合）。')
                return
        if not image_path or not os.path.exists(image_path):
            messagebox.showerror('入力エラー', '画像ファイルを正しく選択してください。')
            return

        # save config
        save_config({
            'post_url': url,
            'post_section_label': section_label,
            'camera_id': camera_id,
            'shot_seq': shot_seq,
            'captured_at': captured_at if not self.send_now_var.get() else now_jst_iso(),
            'post_send_now_jst': bool(self.send_now_var.get()),
            'post_image_path': image_path,
        })

        self.append_log('[INFO] 送信を開始します...')
        self.set_ui_enabled(False)

        def worker():
            try:
                # captured_at 値をモードに応じて決定（JST）
                captured_value = now_jst_iso() if self.send_now_var.get() else captured_at

                metadata = {
                    'section_code': section_code,
                    'camera_id': camera_id,
                    'shot_seq': shot_seq,
                    'captured_at': captured_value,
                }

                mime, _ = mimetypes.guess_type(image_path)
                mime = mime or 'application/octet-stream'
                with open(image_path, 'rb') as f:
                    files = {
                        'metadata': (None, json.dumps(metadata, ensure_ascii=False), 'application/json'),
                        'image': (os.path.basename(image_path), f, mime),
                    }
                    resp = requests.post(url, files=files, timeout=60)

                parsed = None
                try:
                    parsed = resp.json()
                except Exception:
                    parsed = None
                body = parsed if parsed is not None else resp.text

                # 成功時はPOST結果を保存してPUT側の推測に活かす
                if isinstance(parsed, dict) and resp.status_code in (200, 201):
                    lot_id = parsed.get('lot_id')
                    public_path = parsed.get('filename') or parsed.get('public_path')
                    if lot_id or public_path:
                        save_config({
                            'post_last_lot_id': lot_id or '',
                            'post_last_public_path': public_path or '',
                        })

                self.after(0, lambda: self.append_log(f'[DONE] status={resp.status_code} body={body}'))
            except Exception as e:
                self.after(0, lambda: self.append_log(f'[ERROR] {repr(e)}'))
            finally:
                self.after(0, lambda: self.set_ui_enabled(True))

        threading.Thread(target=worker, daemon=True).start()

    def on_close(self):
        # 可能なら現在の値を保存
        try:
            shot_seq = int(self.shot_var.get())
        except Exception:
            shot_seq = 1
        save_config({
            'post_url': self.url_var.get().strip(),
            'post_section_label': self.section_var.get(),
            'camera_id': self.camera_var.get().strip(),
            'shot_seq': shot_seq,
            'captured_at': (self.captured_var.get().strip() if not self.send_now_var.get() else now_jst_iso()),
            'post_send_now_jst': bool(self.send_now_var.get()),
            'post_image_path': self.image_var.get().strip(),
        })
        self.destroy()

    def _on_send_now_toggle(self):
        is_auto = bool(self.send_now_var.get())
        state = tk.DISABLED if is_auto else tk.NORMAL
        self.cap_entry.config(state=state)
        self.set_now_btn.config(state=state)


if __name__ == '__main__':
    app = PostInspectionGUI()
    app.mainloop()