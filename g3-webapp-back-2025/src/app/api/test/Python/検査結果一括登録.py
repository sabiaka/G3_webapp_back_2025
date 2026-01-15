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
        pass


def _normalize_base_host(value: str) -> str:
    """ホストのみのベースURLへ正規化する（例: http://localhost:3001）。
    もし '/api/ingress/inspection' などの固定パスが含まれていたら取り除く。
    """
    default_host = 'http://10.100.54.170:3001'
    if not value:
        return default_host
    trimmed = value.strip()
    if trimmed in ('http://', 'https://', 'http:///', 'https:///'):
        return default_host
    # 既にパスを含む場合はホスト部だけ残す
    prefix = '/api/ingress/inspection'
    if prefix in trimmed:
        trimmed = trimmed.split(prefix, 1)[0]
    trimmed = trimmed.rstrip('/')
    return trimmed


class PostInspectionBulkGUI(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title('検査結果 一括登録ツール (POST /api/ingress/inspection/batch/{lot_id})')
        self.geometry('860x700')
        self._build_widgets()
        self._load_initial_values()
        self.protocol('WM_DELETE_WINDOW', self.on_close)

    def _build_widgets(self):
        pad = {'padx': 8, 'pady': 6}
        frm = ttk.Frame(self)
        frm.pack(fill=tk.BOTH, expand=True)

        # URL base（ホストのみ選択。APIパスは内部で付与）
        ttk.Label(frm, text='サーバURL (ベース)').grid(row=0, column=0, sticky='e', **pad)
        self.base_url_var = tk.StringVar()
        self.base_url_choices = [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://10.100.54.170:3001',
        ]
        self.base_url_combo = ttk.Combobox(frm, textvariable=self.base_url_var, values=self.base_url_choices, width=70)
        self.base_url_combo.grid(row=0, column=1, columnspan=2, sticky='we', **pad)

        # lot_id
        ttk.Label(frm, text='ロットID (lot_id)').grid(row=1, column=0, sticky='e', **pad)
        self.lot_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.lot_var, width=40).grid(row=1, column=1, sticky='w', **pad)

        # section_code
        ttk.Label(frm, text='工程 (section_code)').grid(row=2, column=0, sticky='e', **pad)
        self.section_map = {
            'バネ留め (spring)': 'spring',
            'A層検査 (alayer)': 'alayer',
        }
        self.section_var = tk.StringVar()
        self.section_combo = ttk.Combobox(frm, textvariable=self.section_var, values=list(self.section_map.keys()), state='readonly', width=30)
        self.section_combo.grid(row=2, column=1, sticky='w', **pad)

        # camera_id
        ttk.Label(frm, text='カメラID (camera_id)').grid(row=3, column=0, sticky='e', **pad)
        self.camera_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.camera_var, width=30).grid(row=3, column=1, sticky='w', **pad)

        # shot_seq
        ttk.Label(frm, text='ショット番号 (shot_seq)').grid(row=4, column=0, sticky='e', **pad)
        self.shot_var = tk.IntVar(value=1)
        ttk.Spinbox(frm, from_=1, to=99999, textvariable=self.shot_var, width=10).grid(row=4, column=1, sticky='w', **pad)

        # status
        ttk.Label(frm, text='結果 (status)').grid(row=5, column=0, sticky='e', **pad)
        self.status_var = tk.StringVar()
        self.status_combo = ttk.Combobox(frm, textvariable=self.status_var, values=['OK', 'FAIL', 'MISSING'], state='readonly', width=20)
        self.status_combo.grid(row=5, column=1, sticky='w', **pad)

        # details
        ttk.Label(frm, text='詳細 (details)').grid(row=6, column=0, sticky='ne', **pad)
        self.details_text = tk.Text(frm, height=4, width=50)
        self.details_text.grid(row=6, column=1, columnspan=2, sticky='we', **pad)

        # 現在時刻を自動送信トグル（JST）
        self.send_now_var = tk.BooleanVar(value=True)
        self.send_now_chk = ttk.Checkbutton(frm, text='現在時刻 (JST) を自動送信', variable=self.send_now_var, command=self._on_send_now_toggle)
        self.send_now_chk.grid(row=7, column=0, columnspan=3, sticky='w', **pad)

        # captured_at (任意)
        ttk.Label(frm, text='検査日時 (captured_at, JST ISO 任意)').grid(row=8, column=0, sticky='e', **pad)
        self.captured_var = tk.StringVar()
        self.cap_entry = ttk.Entry(frm, textvariable=self.captured_var, width=40)
        self.cap_entry.grid(row=8, column=1, sticky='w', **pad)
        self.set_now_btn = ttk.Button(frm, text='現在時刻をセット', command=lambda: self.captured_var.set(now_jst_iso()))
        self.set_now_btn.grid(row=8, column=2, sticky='w', **pad)

        # beforeImage
        ttk.Label(frm, text='検査前画像 (beforeImage 任意)').grid(row=9, column=0, sticky='e', **pad)
        self.before_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.before_var, width=50).grid(row=9, column=1, sticky='we', **pad)
        ttk.Button(frm, text='参照...', command=self._browse_before).grid(row=9, column=2, sticky='w', **pad)

        # afterImage
        ttk.Label(frm, text='検査後画像 (afterImage 任意)').grid(row=10, column=0, sticky='e', **pad)
        self.after_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.after_var, width=50).grid(row=10, column=1, sticky='we', **pad)
        ttk.Button(frm, text='参照...', command=self._browse_after).grid(row=10, column=2, sticky='w', **pad)

        # buttons
        btn_frame = ttk.Frame(frm)
        btn_frame.grid(row=11, column=0, columnspan=3, sticky='w', padx=8, pady=(4, 8))
        self.send_btn = ttk.Button(btn_frame, text='送信', command=self.on_send)
        self.send_btn.pack(side=tk.LEFT, padx=(0, 8))
        ttk.Button(btn_frame, text='クリア', command=self.on_clear).pack(side=tk.LEFT)

        # log
        ttk.Label(frm, text='レスポンス / ログ').grid(row=12, column=0, sticky='ne', **pad)
        self.log = tk.Text(frm, height=16, wrap='word')
        self.log.grid(row=12, column=1, columnspan=2, sticky='nsew', **pad)
        scroll = ttk.Scrollbar(frm, command=self.log.yview)
        self.log['yscrollcommand'] = scroll.set
        scroll.grid(row=12, column=3, sticky='ns')

        frm.grid_columnconfigure(1, weight=1)
        frm.grid_rowconfigure(12, weight=1)

    def _load_initial_values(self):
        cfg = load_config()
        loaded_base = _normalize_base_host(cfg.get('post_base_url', 'http://10.100.54.170:3001'))
        if loaded_base not in self.base_url_choices:
            self.base_url_choices.append(loaded_base)
            self.base_url_combo.config(values=self.base_url_choices)
        self.base_url_var.set(loaded_base)
        self.lot_var.set(cfg.get('post_lot_id', 'MAT-00123'))
        self.section_var.set(cfg.get('post_section_label', 'バネ留め (spring)'))
        if self.section_var.get() not in self.section_map:
            self.section_var.set('バネ留め (spring)')
        self.camera_var.set(cfg.get('camera_id', 'B-spring01'))
        self.shot_var.set(int(cfg.get('shot_seq', 1)))
        self.status_var.set(cfg.get('status', 'OK'))
        self.details_text.delete('1.0', tk.END)
        self.details_text.insert('1.0', cfg.get('details', ''))
        self.captured_var.set(cfg.get('captured_at', now_jst_iso()))
        self.send_now_var.set(bool(cfg.get('post_send_now_jst', True)))
        self._on_send_now_toggle()
        self.before_var.set(cfg.get('post_before_path', ''))
        self.after_var.set(cfg.get('post_after_path', ''))

    def _browse_before(self):
        path = filedialog.askopenfilename(title='検査前画像を選択', filetypes=[('画像ファイル', '*.jpg;*.jpeg;*.png;*.bmp;*.gif'), ('すべてのファイル', '*.*')])
        if path:
            self.before_var.set(path)

    def _browse_after(self):
        path = filedialog.askopenfilename(title='検査後画像を選択', filetypes=[('画像ファイル', '*.jpg;*.jpeg;*.png;*.bmp;*.gif'), ('すべてのファイル', '*.*')])
        if path:
            self.after_var.set(path)

    def append_log(self, text: str):
        self.log.insert(tk.END, text + '\n')
        self.log.see(tk.END)

    def on_clear(self):
        self.log.delete('1.0', tk.END)

    def set_ui_enabled(self, enabled: bool):
        self.send_btn.config(state=(tk.NORMAL if enabled else tk.DISABLED))

    def on_send(self):
        base = _normalize_base_host(self.base_url_var.get().strip()).rstrip('/')
        lot_id = self.lot_var.get().strip()
        section_label = self.section_var.get()
        section_code = self.section_map.get(section_label)
        camera_id = self.camera_var.get().strip()
        shot_seq = int(self.shot_var.get())
        status = self.status_var.get().strip() or 'OK'
        details = self.details_text.get('1.0', tk.END).strip() or None
        captured_at = self.captured_var.get().strip() or None
        before_path = self.before_var.get().strip()
        after_path = self.after_var.get().strip()

        if not base:
            messagebox.showerror('入力エラー', 'サーバURL(ベース)は必須です。')
            return
        if not lot_id:
            messagebox.showerror('入力エラー', 'lot_id は必須です。')
            return
        if not status:
            messagebox.showerror('入力エラー', 'status は必須です。')
            return

        # 新仕様: バッチ登録エンドポイント
        url = f"{base}/api/ingress/inspection/batch/{lot_id}"

        save_config({
            'post_base_url': base,
            'post_lot_id': lot_id,
            'post_section_label': section_label,
            'camera_id': camera_id,
            'shot_seq': shot_seq,
            'status': status,
            'details': details or '',
            'captured_at': (captured_at if not self.send_now_var.get() else now_jst_iso()),
            'post_send_now_jst': bool(self.send_now_var.get()),
            'post_before_path': before_path,
            'post_after_path': after_path,
        })
        self.append_log('[INFO] 送信を開始します...')
        self.set_ui_enabled(False)

        def worker():
            file_handles = []
            try:
                # captured_at 値をモードに応じて決定（JST）
                captured_value = now_jst_iso() if self.send_now_var.get() else captured_at

                metadata = {
                    'lot_id': lot_id,
                    'section_code': section_code,
                    'camera_id': camera_id,
                    'status': status,
                    'details': details,
                    'shot_seq': shot_seq,
                }
                if captured_value:
                    metadata['captured_at'] = captured_value

                files = {
                    'metadata': (None, json.dumps(metadata, ensure_ascii=False), 'application/json'),
                }

                if before_path and os.path.exists(before_path):
                    mime, _ = mimetypes.guess_type(before_path)
                    mime = mime or 'application/octet-stream'
                    fh = open(before_path, 'rb')
                    file_handles.append(fh)
                    files['beforeImage'] = (os.path.basename(before_path), fh, mime)

                if after_path and os.path.exists(after_path):
                    mime, _ = mimetypes.guess_type(after_path)
                    mime = mime or 'application/octet-stream'
                    fh = open(after_path, 'rb')
                    file_handles.append(fh)
                    files['afterImage'] = (os.path.basename(after_path), fh, mime)

                resp = requests.post(url, files=files, timeout=60)

                try:
                    body = resp.json()
                except Exception:
                    body = resp.text

                self.after(0, lambda: self.append_log(f'[DONE] status={resp.status_code} body={body}'))
            except Exception as e:
                self.after(0, lambda: self.append_log(f'[ERROR] {repr(e)}'))
            finally:
                for fh in file_handles:
                    try:
                        fh.close()
                    except Exception:
                        pass
                self.after(0, lambda: self.set_ui_enabled(True))

        threading.Thread(target=worker, daemon=True).start()

    def on_close(self):
        try:
            shot_seq = int(self.shot_var.get())
        except Exception:
            shot_seq = 1
        save_config({
            'post_base_url': _normalize_base_host(self.base_url_var.get().strip()),
            'post_lot_id': self.lot_var.get().strip(),
            'post_section_label': self.section_var.get(),
            'camera_id': self.camera_var.get().strip(),
            'shot_seq': shot_seq,
            'status': self.status_var.get().strip() or 'OK',
            'details': self.details_text.get('1.0', tk.END).strip(),
            'captured_at': (self.captured_var.get().strip() if not self.send_now_var.get() else now_jst_iso()),
            'post_send_now_jst': bool(self.send_now_var.get()),
            'post_before_path': self.before_var.get().strip(),
            'post_after_path': self.after_var.get().strip(),
        })
        self.destroy()

    def _on_send_now_toggle(self):
        is_auto = bool(self.send_now_var.get())
        state = tk.DISABLED if is_auto else tk.NORMAL
        self.cap_entry.config(state=state)
        self.set_now_btn.config(state=state)


if __name__ == '__main__':
    app = PostInspectionBulkGUI()
    app.mainloop()