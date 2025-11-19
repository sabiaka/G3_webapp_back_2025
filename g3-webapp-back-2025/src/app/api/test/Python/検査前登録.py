
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

def _normalize_base_url(value: str) -> str:
    """不完全な base URL を補完する。
    'http://' や 'http:///' などスキームのみの場合は既定サーバを付与。
    末尾スラッシュは削除。
    """
    if not value:
        return 'http://10.100.54.170:3001'
    trimmed = value.strip()
    # スキームのみや不完全
    if trimmed in ('http://', 'https://', 'http:///', 'https:///'):
        return 'http://10.100.54.170:3001'
    # 末尾スラッシュ除去
    trimmed = trimmed.rstrip('/')
    return trimmed


class PreInspectionGUI(tk.Tk):
    """検査前データ単一送信GUI

    仕様:
        POST /api/ingress/inspection/{lot_id}
        multipart: metadata(JSON), image(単一ファイル)
        metadata例:
            {
                "section_code": "spring",
                "camera_id": "B-spring01",
                "4K_seq": "A-4",
                "FHD_seq": "D-5",
                "captured_at": "2025-09-12T05:09:02Z"
            }
    """
    def __init__(self):
        super().__init__()
        self.title('検査前データ送信ツール (新仕様: /api/ingress/inspection/{lot_id})')
        self.geometry('820x640')

        self._build_widgets()
        self._load_initial_values()
        self.protocol('WM_DELETE_WINDOW', self.on_close)

    def _build_widgets(self):
        pad = {'padx': 8, 'pady': 6}

        frm = ttk.Frame(self)
        frm.pack(fill=tk.BOTH, expand=True)

        # URL (ベース選択: localhost:3000 / localhost:3001 / 10.100.54.170:3001)
        ttk.Label(frm, text='サーバベースURL').grid(row=0, column=0, sticky='e', **pad)
        self.base_url_var = tk.StringVar()
        self.base_url_choices = [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://10.100.54.170:3001',
        ]
        self.base_url_combo = ttk.Combobox(frm, textvariable=self.base_url_var, values=self.base_url_choices, width=60)
        self.base_url_combo.grid(row=0, column=1, sticky='w', **pad)

        # lot_id
        ttk.Label(frm, text='lot_id').grid(row=1, column=0, sticky='e', **pad)
        self.lot_id_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.lot_id_var, width=24).grid(row=1, column=1, sticky='w', **pad)

        # section_code (表示ラベル→コード)
        ttk.Label(frm, text='工程 (section_code)').grid(row=2, column=0, sticky='e', **pad)
        self.section_map = {
            'バネ留め (spring)': 'spring',
            'A層検査 (alayer)': 'alayer',
        }
        self.section_var = tk.StringVar()
        self.section_combo = ttk.Combobox(frm, textvariable=self.section_var, values=list(self.section_map.keys()), state='readonly', width=30)
        self.section_combo.grid(row=2, column=1, sticky='w', **pad)

        # camera_id
        ttk.Label(frm, text='camera_id').grid(row=3, column=0, sticky='e', **pad)
        self.camera_id_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.camera_id_var, width=30).grid(row=3, column=1, sticky='w', **pad)

        # 4K_seq / FHD_seq
        ttk.Label(frm, text='4K_seq').grid(row=4, column=0, sticky='e', **pad)
        self.seq4k_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.seq4k_var, width=18).grid(row=4, column=1, sticky='w', **pad)

        ttk.Label(frm, text='FHD_seq').grid(row=5, column=0, sticky='e', **pad)
        self.seqfhd_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.seqfhd_var, width=18).grid(row=5, column=1, sticky='w', **pad)

        # captured_at + 自動トグル
        self.send_now_var = tk.BooleanVar(value=True)
        self.send_now_chk = ttk.Checkbutton(frm, text='captured_at を現在時刻 (JST) に自動設定', variable=self.send_now_var, command=self._on_send_now_toggle)
        self.send_now_chk.grid(row=6, column=0, columnspan=2, sticky='w', **pad)

        ttk.Label(frm, text='captured_at (ISO JST)').grid(row=7, column=0, sticky='e', **pad)
        self.captured_at_var = tk.StringVar()
        self.captured_at_entry = ttk.Entry(frm, textvariable=self.captured_at_var, width=32)
        self.captured_at_entry.grid(row=7, column=1, sticky='w', **pad)

        # 画像ファイル
        ttk.Label(frm, text='画像ファイル').grid(row=8, column=0, sticky='e', **pad)
        self.image_path_var = tk.StringVar()
        img_entry = ttk.Entry(frm, textvariable=self.image_path_var, width=50)
        img_entry.grid(row=8, column=1, sticky='w', **pad)
        def browse_img():
            path = filedialog.askopenfilename(title='画像を選択', filetypes=[('画像ファイル', '*.jpg;*.jpeg;*.png;*.bmp;*.gif'), ('すべてのファイル', '*.*')])
            if path:
                self.image_path_var.set(path)
        ttk.Button(frm, text='参照', command=browse_img).grid(row=8, column=2, sticky='w', **pad)

        # 送信 / クリア
        btn_frame = ttk.Frame(frm)
        btn_frame.grid(row=9, column=0, columnspan=3, sticky='w', padx=8, pady=(4, 8))
        self.send_btn = ttk.Button(btn_frame, text='送信', command=self.on_send)
        self.send_btn.pack(side=tk.LEFT, padx=(0, 8))
        ttk.Button(btn_frame, text='クリアログ', command=self.on_clear).pack(side=tk.LEFT)

        # ログ
        ttk.Label(frm, text='レスポンス / ログ').grid(row=10, column=0, sticky='ne', **pad)
        self.log = tk.Text(frm, height=18, wrap='word')
        self.log.grid(row=10, column=1, columnspan=2, sticky='nsew', **pad)
        sb = ttk.Scrollbar(frm, command=self.log.yview)
        self.log['yscrollcommand'] = sb.set
        sb.grid(row=10, column=3, sticky='ns')

        frm.grid_columnconfigure(1, weight=1)
        frm.grid_rowconfigure(10, weight=1)

    # 旧マルチショットUI削除済み: add_shot_row 等は不要

    def _remove_shot_row(self, row_frame: ttk.Frame):
        pass  # 廃止
    def _load_initial_values(self):
        cfg = load_config()
        loaded_base = _normalize_base_url(cfg.get('pre_base_url', 'http://10.100.54.170:3001'))
        # 候補に無い場合も自由入力としてそのまま使えるように設定
        if loaded_base not in self.base_url_choices:
            self.base_url_choices.append(loaded_base)
            self.base_url_combo.config(values=self.base_url_choices)
        self.base_url_var.set(loaded_base)
        self.lot_id_var.set(cfg.get('pre_lot_id', 'MAT-00125'))
        self.section_var.set(cfg.get('pre_section_label', 'バネ留め (spring)'))
        if self.section_var.get() not in self.section_map:
            self.section_var.set('バネ留め (spring)')
        self.camera_id_var.set(cfg.get('pre_camera_id', 'B-spring01'))
        self.seq4k_var.set(cfg.get('pre_4K_seq', 'A-4'))
        self.seqfhd_var.set(cfg.get('pre_FHD_seq', 'D-5'))
        self.send_now_var.set(bool(cfg.get('pre_send_now_jst', True)))
        self.captured_at_var.set(cfg.get('pre_captured_at', now_jst_iso()))
        self.image_path_var.set(cfg.get('pre_image_path', ''))
        self._apply_send_now_state()

    

    def append_log(self, text: str):
        self.log.insert(tk.END, text + '\n')
        self.log.see(tk.END)

    def on_clear(self):
        self.log.delete('1.0', tk.END)

    def set_ui_enabled(self, enabled: bool):
        state = tk.NORMAL if enabled else tk.DISABLED
        self.send_btn.config(state=state)

    def on_send(self):
        base_url = _normalize_base_url(self.base_url_var.get().strip())
        lot_id = self.lot_id_var.get().strip()
        section_label = self.section_var.get()
        section_code = self.section_map.get(section_label)
        camera_id = self.camera_id_var.get().strip()
        seq4k = self.seq4k_var.get().strip()
        seqfhd = self.seqfhd_var.get().strip()
        captured_at = self.captured_at_var.get().strip()
        image_path = self.image_path_var.get().strip()

        # 入力検証
        if not base_url:
            messagebox.showerror('入力エラー', 'サーバベースURLは必須です。')
            return
        if not lot_id:
            messagebox.showerror('入力エラー', 'lot_id は必須です。')
            return
        if not section_code:
            messagebox.showerror('入力エラー', '工程(section_code)を選択してください。')
            return
        if not camera_id:
            messagebox.showerror('入力エラー', 'camera_id は必須です。')
            return
        if not seq4k:
            messagebox.showerror('入力エラー', '4K_seq を入力してください。')
            return
        if not seqfhd:
            messagebox.showerror('入力エラー', 'FHD_seq を入力してください。')
            return
        if not self.send_now_var.get() and not captured_at:
            messagebox.showerror('入力エラー', 'captured_at を入力してください（自動設定OFF）。')
            return
        if not image_path or not os.path.exists(image_path):
            messagebox.showerror('入力エラー', '画像ファイルを正しく選択してください。')
            return

        # URL生成
        url = base_url.rstrip('/') + f'/api/ingress/inspection/{lot_id}'

        # config 保存
        save_config({
            'pre_base_url': base_url,
            'pre_lot_id': lot_id,
            'pre_section_label': section_label,
            'pre_camera_id': camera_id,
            'pre_4K_seq': seq4k,
            'pre_FHD_seq': seqfhd,
            'pre_send_now_jst': bool(self.send_now_var.get()),
            'pre_captured_at': (captured_at if not self.send_now_var.get() else now_jst_iso()),
            'pre_image_path': image_path,
        })

        self.append_log('[INFO] 送信開始...')
        self.set_ui_enabled(False)

        def worker():
            try:
                cap_val = now_jst_iso() if self.send_now_var.get() else captured_at
                metadata = {
                    'section_code': section_code,
                    'camera_id': camera_id,
                    '4K_seq': seq4k,
                    'FHD_seq': seqfhd,
                    'captured_at': cap_val,
                }
                mime, _ = mimetypes.guess_type(image_path)
                mime = mime or 'application/octet-stream'
                files = {
                    'metadata': (None, json.dumps(metadata, ensure_ascii=False), 'application/json'),
                    'image': (os.path.basename(image_path), open(image_path, 'rb'), mime),
                }
                try:
                    resp = requests.post(url, files=files, timeout=60)
                finally:
                    try:
                        files['image'][1].close()
                    except Exception:
                        pass

                try:
                    body = resp.json()
                except Exception:
                    body = resp.text

                # 成功時メタ保存（レスポンス仕様に合わせて柔軟に）
                if isinstance(body, dict) and resp.status_code in (200, 201):
                    save_extra = {}
                    if 'lot_id' in body:
                        save_extra['pre_last_lot_id'] = body['lot_id']
                    if 'filename' in body:
                        save_extra['pre_last_filename'] = body['filename']
                    elif 'filenames' in body and isinstance(body['filenames'], list):
                        save_extra['pre_last_filenames'] = body['filenames']
                    if save_extra:
                        save_config(save_extra)

                self.after(0, lambda: self.append_log(f'[DONE] status={resp.status_code} body={body}'))
            except Exception as e:
                self.after(0, lambda: self.append_log(f'[ERROR] {repr(e)}'))
            finally:
                self.after(0, lambda: self.set_ui_enabled(True))

        threading.Thread(target=worker, daemon=True).start()

    def on_close(self):
        save_config({
            'pre_base_url': _normalize_base_url(self.base_url_var.get().strip()),
            'pre_lot_id': self.lot_id_var.get().strip(),
            'pre_section_label': self.section_var.get(),
            'pre_camera_id': self.camera_id_var.get().strip(),
            'pre_4K_seq': self.seq4k_var.get().strip(),
            'pre_FHD_seq': self.seqfhd_var.get().strip(),
            'pre_send_now_jst': bool(self.send_now_var.get()),
            'pre_captured_at': (self.captured_at_var.get().strip() if not self.send_now_var.get() else now_jst_iso()),
            'pre_image_path': self.image_path_var.get().strip(),
        })
        self.destroy()

    def _on_send_now_toggle(self):
        self._apply_send_now_state()

    def _apply_send_now_state(self):
        is_auto = bool(self.send_now_var.get())
        state = tk.DISABLED if is_auto else tk.NORMAL
        self.captured_at_entry.config(state=state)
        if is_auto:
            self.captured_at_var.set(now_jst_iso())


if __name__ == '__main__':
    app = PreInspectionGUI()
    app.mainloop()