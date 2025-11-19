

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


def now_utc_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def _normalize_base_url(value: str) -> str:
    """ホストベースURLを返す（例: http://localhost:3001）。
    既に '/api/ingress/inspection/result' まで含まれている場合は取り除く。
    """
    default_host = 'http://10.100.54.170:3001'
    if not value:
        return default_host
    trimmed = value.strip()
    if trimmed in ('http://', 'https://', 'http:///', 'https:///'):
        return default_host
    # 不要な固定パスが入っていた場合はホスト部だけにする
    prefix = '/api/ingress/inspection/result'
    if prefix in trimmed:
        trimmed = trimmed.split(prefix, 1)[0]
    trimmed = trimmed.rstrip('/')
    return trimmed

class PutInspectionGUI(tk.Tk):
    """検査後データ送信 GUI (新仕様)

    PUT /api/ingress/inspection/result/{filename}
    multipart parts:
      - metadata (JSON): { status, details?, captured_at (UTC ISO) }
      - image (PNG/JPEG 等) 必須
    """
    def __init__(self):
        super().__init__()
        self.title('検査後データ送信ツール (PUT /api/ingress/inspection/result/{filename})')
        self.geometry('760x600')
        self._build_widgets()
        self._load_initial_values()
        self.protocol('WM_DELETE_WINDOW', self.on_close)

    def _build_widgets(self):
        pad = {'padx': 8, 'pady': 6}
        frm = ttk.Frame(self)
        frm.pack(fill=tk.BOTH, expand=True)

        ttk.Label(frm, text='ベースURL').grid(row=0, column=0, sticky='e', **pad)
        self.base_url_var = tk.StringVar()
        # 選択肢: ホストのみ（固定パスは内部で付与）
        self.base_url_choices = [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://10.100.54.170:3001',
        ]
        self.base_url_combo = ttk.Combobox(frm, textvariable=self.base_url_var, values=self.base_url_choices, width=60)
        self.base_url_combo.grid(row=0, column=1, sticky='w', **pad)

        # ファイル名関連フィールド (自動生成)
        ttk.Label(frm, text='lot_id').grid(row=1, column=0, sticky='e', **pad)
        self.lot_id_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.lot_id_var, width=22).grid(row=1, column=1, sticky='w', **pad)

        ttk.Label(frm, text='camera_id').grid(row=2, column=0, sticky='e', **pad)
        self.camera_id_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.camera_id_var, width=22).grid(row=2, column=1, sticky='w', **pad)

        ttk.Label(frm, text='4K_seq').grid(row=3, column=0, sticky='e', **pad)
        self.seq4k_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.seq4k_var, width=12).grid(row=3, column=1, sticky='w', **pad)

        ttk.Label(frm, text='FHD_seq').grid(row=4, column=0, sticky='e', **pad)
        self.seqfhd_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.seqfhd_var, width=12).grid(row=4, column=1, sticky='w', **pad)

        ttk.Label(frm, text='生成ファイル名').grid(row=5, column=0, sticky='e', **pad)
        self.filename_var = tk.StringVar()
        filename_entry = ttk.Entry(frm, textvariable=self.filename_var, width=40)
        filename_entry.grid(row=5, column=1, sticky='w', **pad)
        ttk.Button(frm, text='再生成', command=self._rebuild_filename).grid(row=5, column=2, sticky='w', **pad)

        ttk.Label(frm, text='結果 (status)').grid(row=6, column=0, sticky='e', **pad)
        self.status_var = tk.StringVar()
        self.status_combo = ttk.Combobox(frm, textvariable=self.status_var, values=['OK', 'FAIL', 'MISSING'], state='readonly', width=20)
        self.status_combo.grid(row=6, column=1, sticky='w', **pad)

        ttk.Label(frm, text='詳細 (details 任意)').grid(row=7, column=0, sticky='ne', **pad)
        self.details_text = tk.Text(frm, height=4, width=50)
        self.details_text.grid(row=7, column=1, columnspan=1, sticky='we', **pad)

        # captured_at (UTC) 自動設定トグル
        self.send_now_var = tk.BooleanVar(value=True)
        self.send_now_chk = ttk.Checkbutton(frm, text='captured_at を現在UTC時刻で自動設定', variable=self.send_now_var, command=self._on_send_now_toggle)
        self.send_now_chk.grid(row=8, column=0, columnspan=2, sticky='w', **pad)

        ttk.Label(frm, text='captured_at (UTC ISO 手動時)').grid(row=9, column=0, sticky='e', **pad)
        self.captured_var = tk.StringVar()
        self.captured_entry = ttk.Entry(frm, textvariable=self.captured_var, width=40)
        self.captured_entry.grid(row=9, column=1, sticky='w', **pad)
        ttk.Button(frm, text='現在UTCをセット', command=lambda: self.captured_var.set(now_utc_iso())).grid(row=9, column=2, sticky='w', **pad)

        ttk.Label(frm, text='検査後画像 (必須)').grid(row=10, column=0, sticky='e', **pad)
        self.image_path_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.image_path_var, width=50).grid(row=10, column=1, sticky='w', **pad)
        ttk.Button(frm, text='参照...', command=self._browse_image).grid(row=10, column=2, sticky='w', **pad)

        btn_frame = ttk.Frame(frm)
        btn_frame.grid(row=11, column=0, columnspan=3, sticky='w', padx=8, pady=(4, 8))
        self.send_btn = ttk.Button(btn_frame, text='送信', command=self.on_send)
        self.send_btn.pack(side=tk.LEFT, padx=(0, 8))
        ttk.Button(btn_frame, text='ログクリア', command=self.on_clear).pack(side=tk.LEFT)

        ttk.Label(frm, text='レスポンス / ログ').grid(row=12, column=0, sticky='ne', **pad)
        self.log = tk.Text(frm, height=16, wrap='word')
        self.log.grid(row=12, column=1, columnspan=2, sticky='nsew', **pad)
        scroll = ttk.Scrollbar(frm, command=self.log.yview)
        self.log['yscrollcommand'] = scroll.set
        scroll.grid(row=12, column=3, sticky='ns')

        frm.grid_columnconfigure(1, weight=1)
        frm.grid_rowconfigure(12, weight=1)

        # ファイル名自動生成トレース
        for var in (self.lot_id_var, self.camera_id_var, self.seq4k_var, self.seqfhd_var):
            var.trace_add('write', lambda *args: self._auto_filename())

    def _load_initial_values(self):
        cfg = load_config()
        loaded_base = _normalize_base_url(cfg.get('put_base_url', 'http://10.100.54.170:3001'))
        if loaded_base not in self.base_url_choices:
            self.base_url_choices.append(loaded_base)
            self.base_url_combo.config(values=self.base_url_choices)
        self.base_url_var.set(loaded_base)
        self.lot_id_var.set(cfg.get('put_lot_id', 'MAT-00123'))
        self.camera_id_var.set(cfg.get('put_camera_id', 'B-spring01'))
        self.seq4k_var.set(cfg.get('put_4K_seq', 'A-4'))
        self.seqfhd_var.set(cfg.get('put_FHD_seq', 'D-5'))
        # 初期生成
        self._rebuild_filename()
        self.status_var.set(cfg.get('put_status', 'FAIL'))
        self.details_text.delete('1.0', tk.END)
        self.details_text.insert('1.0', cfg.get('put_details', '傷あり'))
        self.captured_var.set(cfg.get('put_captured_at', now_utc_iso()))
        self.send_now_var.set(bool(cfg.get('put_send_now_utc', True)))
        self.image_path_var.set(cfg.get('put_image_path', ''))
        self._apply_send_now_state()

    def _browse_image(self):
        path = filedialog.askopenfilename(title='検査後画像を選択', filetypes=[('画像ファイル', '*.jpg;*.jpeg;*.png;*.bmp;*.gif'), ('すべてのファイル', '*.*')])
        if path:
            self.image_path_var.set(path)

    # 旧POST結果推測機能は新仕様では不要

    def append_log(self, text: str):
        self.log.insert(tk.END, text + '\n')
        self.log.see(tk.END)

    def on_clear(self):
        self.log.delete('1.0', tk.END)

    def set_ui_enabled(self, enabled: bool):
        self.send_btn.config(state=(tk.NORMAL if enabled else tk.DISABLED))

    def on_send(self):
        base = _normalize_base_url(self.base_url_var.get()).rstrip('/')
        # 再確認生成（ユーザが手動編集した場合は優先）
        auto_name = self._compose_filename()
        current_name = self.filename_var.get().strip()
        filename = current_name if current_name else auto_name
        status = self.status_var.get().strip() or 'OK'
        details = self.details_text.get('1.0', tk.END).strip() or None
        captured_at_manual = self.captured_var.get().strip() or None
        image_path = self.image_path_var.get().strip()
        lot = self.lot_id_var.get().strip()
        cam = self.camera_id_var.get().strip()
        seq4k = self.seq4k_var.get().strip()
        seqfhd = self.seqfhd_var.get().strip()

        if not base:
            messagebox.showerror('入力エラー', 'ベースURLは必須です。')
            return
        if not filename:
            messagebox.showerror('入力エラー', 'filename は必須です。')
            return
        if not status:
            messagebox.showerror('入力エラー', 'status は必須です。')
            return
        if not image_path or not os.path.exists(image_path):
            messagebox.showerror('入力エラー', '画像ファイルを選択してください。')
            return
        # ファイル名構成要素チェック
        if not (lot and cam and seq4k and seqfhd):
            messagebox.showwarning('警告', 'lot_id / camera_id / 4K_seq / FHD_seq が一部未入力です。ファイル名が期待通りでない可能性があります。')

        url = f"{base}/api/ingress/inspection/result/{filename}"

        save_config({
            'put_base_url': base,
            'put_filename': filename,
            'put_status': status,
            'put_details': details or '',
            'put_captured_at': (captured_at_manual if not self.send_now_var.get() else now_utc_iso()),
            'put_send_now_utc': bool(self.send_now_var.get()),
            'put_image_path': image_path,
            'put_lot_id': lot,
            'put_camera_id': cam,
            'put_4K_seq': seq4k,
            'put_FHD_seq': seqfhd,
        })

        self.append_log('[INFO] 送信開始...')
        self.set_ui_enabled(False)

        def worker():
            try:
                cap_val = now_utc_iso() if self.send_now_var.get() else captured_at_manual
                metadata = {
                    'status': status,
                }
                if details:
                    metadata['details'] = details
                if cap_val:
                    metadata['captured_at'] = cap_val

                mime, _ = mimetypes.guess_type(image_path)
                mime = mime or 'application/octet-stream'
                files = {
                    'metadata': (None, json.dumps(metadata, ensure_ascii=False), 'application/json'),
                    'image': (os.path.basename(image_path), open(image_path, 'rb'), mime),
                }
                try:
                    resp = requests.put(url, files=files, timeout=60)
                finally:
                    try:
                        files['image'][1].close()
                    except Exception:
                        pass
                try:
                    body = resp.json()
                except Exception:
                    body = resp.text
                self.after(0, lambda: self.append_log(f'[DONE] status={resp.status_code} body={body}'))
            except Exception as e:
                self.after(0, lambda: self.append_log(f'[ERROR] {repr(e)}'))
            finally:
                self.after(0, lambda: self.set_ui_enabled(True))

        threading.Thread(target=worker, daemon=True).start()

    def on_close(self):
        save_config({
            'put_base_url': _normalize_base_url(self.base_url_var.get().strip()),
            'put_filename': self.filename_var.get().strip(),
            'put_status': self.status_var.get().strip() or 'OK',
            'put_details': self.details_text.get('1.0', tk.END).strip(),
            'put_captured_at': (self.captured_var.get().strip() if not self.send_now_var.get() else now_utc_iso()),
            'put_send_now_utc': bool(self.send_now_var.get()),
            'put_image_path': self.image_path_var.get().strip(),
            'put_lot_id': self.lot_id_var.get().strip(),
            'put_camera_id': self.camera_id_var.get().strip(),
            'put_4K_seq': self.seq4k_var.get().strip(),
            'put_FHD_seq': self.seqfhd_var.get().strip(),
        })
        self.destroy()

    def _on_send_now_toggle(self):
        self._apply_send_now_state()

    def _apply_send_now_state(self):
        is_auto = bool(self.send_now_var.get())
        state = tk.DISABLED if is_auto else tk.NORMAL
        self.captured_entry.config(state=state)
        if is_auto:
            self.captured_var.set(now_utc_iso())

    def _compose_filename(self) -> str:
        lot = self.lot_id_var.get().strip()
        cam = self.camera_id_var.get().strip()
        seq4k = self.seq4k_var.get().strip()
        seqfhd = self.seqfhd_var.get().strip()
        if lot and cam and seq4k and seqfhd:
            return f"{lot}_{cam}_{seq4k}_{seqfhd}.png"
        return ''

    def _auto_filename(self):
        # 自動更新（既にユーザが手動編集している場合は上書きしない）
        current = self.filename_var.get().strip()
        composed = self._compose_filename()
        if composed and (not current or current.endswith('.png') and current.count('_') < 3):
            self.filename_var.set(composed)

    def _rebuild_filename(self):
        self.filename_var.set(self._compose_filename())


if __name__ == '__main__':
    app = PutInspectionGUI()
    app.mainloop()