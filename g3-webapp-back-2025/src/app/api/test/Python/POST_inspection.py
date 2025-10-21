
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
        self.title('検査前データ 送信ツール (POST /api/ingress/inspection) - マルチショット対応')
        self.geometry('960x720')

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

        # ショット行（マルチショット）
        ttk.Label(frm, text='ショット一覧').grid(row=2, column=0, sticky='ne', **pad)
        self.shots_container = ttk.Frame(frm)
        self.shots_container.grid(row=2, column=1, columnspan=2, sticky='we', **pad)

        # ヘッダー
        header = ttk.Frame(self.shots_container)
        header.grid(row=0, column=0, sticky='we')
        ttk.Label(header, text='camera_id').grid(row=0, column=0, padx=4)
        ttk.Label(header, text='shot_seq').grid(row=0, column=1, padx=4)
        ttk.Label(header, text='captured_at (JST ISO)').grid(row=0, column=2, padx=4)
        ttk.Label(header, text='画像パス').grid(row=0, column=3, padx=4)
        ttk.Label(header, text='').grid(row=0, column=4, padx=4)
        ttk.Label(header, text='').grid(row=0, column=5, padx=4)

        self.shots_rows_frame = ttk.Frame(self.shots_container)
        self.shots_rows_frame.grid(row=1, column=0, sticky='we')
        self.shot_rows = []  # list of dict: {camera_var, shot_var, cap_var, img_var, widgets}

        # 現在時刻を自動送信トグル（JST）
        self.send_now_var = tk.BooleanVar(value=True)
        self.send_now_chk = ttk.Checkbutton(frm, text='現在時刻 (JST) を自動送信（全ショット）', variable=self.send_now_var, command=self._on_send_now_toggle)
        self.send_now_chk.grid(row=3, column=0, columnspan=3, sticky='w', **pad)

        # 行操作ボタン
        ops = ttk.Frame(frm)
        ops.grid(row=4, column=0, columnspan=3, sticky='w', **pad)
        ttk.Button(ops, text='＋ 行を追加', command=self.add_shot_row).pack(side=tk.LEFT)

        # buttons
        btn_frame = ttk.Frame(frm)
        btn_frame.grid(row=5, column=0, columnspan=3, sticky='w', padx=8, pady=(4, 8))
        self.send_btn = ttk.Button(btn_frame, text='送信', command=self.on_send)
        self.send_btn.pack(side=tk.LEFT, padx=(0, 8))
        ttk.Button(btn_frame, text='クリア', command=self.on_clear).pack(side=tk.LEFT)

        # log
        ttk.Label(frm, text='レスポンス / ログ').grid(row=6, column=0, sticky='ne', **pad)
        self.log = tk.Text(frm, height=16, wrap='word')
        self.log.grid(row=6, column=1, columnspan=2, sticky='nsew', **pad)
        sb = ttk.Scrollbar(frm, command=self.log.yview)
        self.log['yscrollcommand'] = sb.set
        sb.grid(row=6, column=3, sticky='ns')

        # grid config
        frm.grid_columnconfigure(1, weight=1)
        frm.grid_rowconfigure(6, weight=1)

    def add_shot_row(self, preset: dict | None = None):
        idx = len(self.shot_rows)
        row = ttk.Frame(self.shots_rows_frame)
        row.grid(row=idx, column=0, sticky='we', pady=2)

        camera_var = tk.StringVar(value=(preset.get('camera_id') if preset else 'B-spring01'))
        shot_var = tk.IntVar(value=int(preset.get('shot_seq', 1)) if preset else 1)
        cap_var = tk.StringVar(value=(preset.get('captured_at') if preset else now_jst_iso()))
        img_var = tk.StringVar(value=(preset.get('image_path') if preset else ''))

        cam_entry = ttk.Entry(row, textvariable=camera_var, width=20)
        cam_entry.grid(row=0, column=0, padx=4)

        shot_spin = ttk.Spinbox(row, from_=1, to=99999, textvariable=shot_var, width=6)
        shot_spin.grid(row=0, column=1, padx=4)

        cap_entry = ttk.Entry(row, textvariable=cap_var, width=26)
        cap_entry.grid(row=0, column=2, padx=4)

        img_entry = ttk.Entry(row, textvariable=img_var, width=36)
        img_entry.grid(row=0, column=3, padx=4)

        def browse():
            path = filedialog.askopenfilename(title='画像を選択', filetypes=[('画像ファイル', '*.jpg;*.jpeg;*.png;*.bmp;*.gif'), ('すべてのファイル', '*.*')])
            if path:
                img_var.set(path)

        ttk.Button(row, text='参照', command=browse).grid(row=0, column=4, padx=4)

        def remove_this():
            self._remove_shot_row(row)

        ttk.Button(row, text='削除', command=remove_this).grid(row=0, column=5, padx=4)

        self.shot_rows.append({
            'frame': row,
            'camera_var': camera_var,
            'shot_var': shot_var,
            'cap_var': cap_var,
            'img_var': img_var,
            'cap_entry': cap_entry,
        })

        # 自動送信モードに応じて有効/無効
        self._apply_send_now_to_rows()

    def _remove_shot_row(self, row_frame: ttk.Frame):
        # 物理削除
        for i, info in enumerate(self.shot_rows):
            if info['frame'] is row_frame:
                info['frame'].destroy()
                del self.shot_rows[i]
                break
        # 再レイアウト
        for i, info in enumerate(self.shot_rows):
            info['frame'].grid(row=i, column=0, sticky='we', pady=2)
    def _load_initial_values(self):
        cfg = load_config()
        # Defaults
        self.url_var.set(cfg.get('post_url', 'http://localhost:3000/api/ingress/inspection'))
        self.section_var.set(cfg.get('post_section_label', 'バネ留め (spring)'))
        if self.section_var.get() not in self.section_map:
            self.section_var.set('バネ留め (spring)')
        self.send_now_var.set(bool(cfg.get('post_send_now_jst', True)))
        # ショットの復元
        shots = cfg.get('post_shots')
        if shots and isinstance(shots, list):
            for s in shots:
                self.add_shot_row(s)
        else:
            # デフォルト1行
            self.add_shot_row({'camera_id': 'B-spring01', 'shot_seq': 1, 'captured_at': now_jst_iso(), 'image_path': ''})

    

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

        # 行データ収集
        rows = []
        camera_ids = set()
        for info in self.shot_rows:
            cam = info['camera_var'].get().strip()
            try:
                seq = int(info['shot_var'].get())
            except Exception:
                seq = None
            cap = info['cap_var'].get().strip()
            img = info['img_var'].get().strip()
            # 検証
            if not cam:
                messagebox.showerror('入力エラー', 'camera_id は全行で必須です。')
                return
            if cam in camera_ids:
                messagebox.showerror('入力エラー', f'camera_id が重複しています: {cam}')
                return
            camera_ids.add(cam)
            if not seq or seq < 1:
                messagebox.showerror('入力エラー', f'shot_seq は正の整数で入力してください (camera_id={cam})')
                return
            if not self.send_now_var.get() and not cap:
                messagebox.showerror('入力エラー', f'captured_at は必須です（自動送信OFF時）(camera_id={cam})')
                return
            if not img or not os.path.exists(img):
                messagebox.showerror('入力エラー', f'画像ファイルを正しく選択してください (camera_id={cam})')
                return
            rows.append({'camera_id': cam, 'shot_seq': seq, 'captured_at': cap, 'image_path': img})

        if not url:
            messagebox.showerror('入力エラー', 'サーバURLは必須です。')
            return
        if not section_code:
            messagebox.showerror('入力エラー', '工程を選択してください。')
            return

        # save config
        save_config({
            'post_url': url,
            'post_section_label': section_label,
            'post_send_now_jst': bool(self.send_now_var.get()),
            'post_shots': [
                {
                    'camera_id': r['camera_id'],
                    'shot_seq': r['shot_seq'],
                    'captured_at': (r['captured_at'] if not self.send_now_var.get() else now_jst_iso()),
                    'image_path': r['image_path'],
                }
                for r in rows
            ],
        })

        self.append_log('[INFO] 送信を開始します...')
        self.set_ui_enabled(False)

        def worker():
            try:
                # メタデータとファイルを構築
                shots_meta = []
                files = {}
                opened_files = []
                for r in rows:
                    cap_val = now_jst_iso() if self.send_now_var.get() else r['captured_at']
                    shots_meta.append({
                        'camera_id': r['camera_id'],
                        'shot_seq': r['shot_seq'],
                        'captured_at': cap_val,
                    })
                    mime, _ = mimetypes.guess_type(r['image_path'])
                    mime = mime or 'application/octet-stream'
                    fh = open(r['image_path'], 'rb')
                    opened_files.append(fh)
                    files[r['camera_id']] = (os.path.basename(r['image_path']), fh, mime)

                metadata = {
                    'section_code': section_code,
                    'shots': shots_meta,
                }
                files['metadata'] = (None, json.dumps(metadata, ensure_ascii=False), 'application/json')

                try:
                    resp = requests.post(url, files=files, timeout=120)
                finally:
                    for fh in opened_files:
                        try:
                            fh.close()
                        except Exception:
                            pass

                parsed = None
                try:
                    parsed = resp.json()
                except Exception:
                    parsed = None
                body = parsed if parsed is not None else resp.text

                # 成功時はPOST結果を保存（複数ファイル名にも対応）
                if isinstance(parsed, dict) and resp.status_code in (200, 201):
                    lot_id = parsed.get('lot_id')
                    filenames = parsed.get('filenames')
                    filename = parsed.get('filename') or parsed.get('public_path')
                    save_payload = {}
                    if lot_id:
                        save_payload['post_last_lot_id'] = lot_id
                    if isinstance(filenames, list):
                        save_payload['post_last_public_paths'] = filenames
                    elif filename:
                        save_payload['post_last_public_path'] = filename
                    if save_payload:
                        save_config(save_payload)

                self.after(0, lambda: self.append_log(f'[DONE] status={resp.status_code} body={body}'))
            except Exception as e:
                self.after(0, lambda: self.append_log(f'[ERROR] {repr(e)}'))
            finally:
                self.after(0, lambda: self.set_ui_enabled(True))

        threading.Thread(target=worker, daemon=True).start()

    def on_close(self):
        # 可能なら現在の値を保存
        try:
            # 保存用に行データをまとめる
            shots_for_save = []
            for info in self.shot_rows:
                shots_for_save.append({
                    'camera_id': info['camera_var'].get().strip(),
                    'shot_seq': int(info['shot_var'].get()) if str(info['shot_var'].get()).isdigit() else 1,
                    'captured_at': (info['cap_var'].get().strip() if not self.send_now_var.get() else now_jst_iso()),
                    'image_path': info['img_var'].get().strip(),
                })
        except Exception:
            shots_for_save = []
        save_config({
            'post_url': self.url_var.get().strip(),
            'post_section_label': self.section_var.get(),
            'post_send_now_jst': bool(self.send_now_var.get()),
            'post_shots': shots_for_save,
        })
        self.destroy()

    def _on_send_now_toggle(self):
        self._apply_send_now_to_rows()

    def _apply_send_now_to_rows(self):
        is_auto = bool(self.send_now_var.get())
        state = tk.DISABLED if is_auto else tk.NORMAL
        for info in self.shot_rows:
            info['cap_entry'].config(state=state)


if __name__ == '__main__':
    app = PostInspectionGUI()
    app.mainloop()