import pymcprotocol
import requests
import datetime
import time
import os
import sys

# =========================
# 設定
# =========================
# PLC本体
PLC_IP = os.getenv("PLC_IP", "10.112.13.52")
PLC_PORT = int(os.getenv("PLC_PORT", "5000"))

# Web(API)サーバー
API_HOST = os.getenv("API_HOST", "10.100.54.170")
API_PORT = int(os.getenv("API_PORT", "3001"))
SERVER_URL = f"http://{API_HOST}:{API_PORT}/api/ingress/plc"

# サンプルデータに合わせた名称
MACHINE_NAME = "半自動表層バネどめ機"
POLL_INTERVAL_SEC = float(os.getenv("POLL_INTERVAL_SEC", "2"))

# 監視方針
SEND_ON_RISE_ONLY_FOR_D = True
SEND_ON_CHANGE_FOR_XY = True

# =========================
# Dレジスタ・エラーコード対応表
# (log_type, title, message, unit_id)
# =========================
def get_error_config(reg, value):
    # 非常停止
    if reg == "D900" and value == 1:
        return ("error", "E-001: 非常停止ボタン作動", "非常停止が検知され、機械が即時停止。", None)
    
    # 残弾数 致命的低下 (D901-D904)
    if reg.startswith("D90") and reg[3] in "1234" and value == 1:
        return ("error", "E-002: 残弾数 致命的低下", "弾数が致命的に少なく、運転継続不可。", int(reg[3]))
    
    # 残弾数 低下 (D101-D104)
    if reg.startswith("D10") and reg[3] in "1234" and value == 1:
        return ("warning", "W-001: 残弾数 低下", "弾数が少なく、補充推奨。", int(reg[3]))
    
    # PLC スタンバイ
    if reg == "D1" and value in [1, 4, 5]:
        return ("info", "I-002: PLC スタンバイ", "PLCが待機状態になったことを通知。", None)

    # その他エラー
    if reg == "D100" and value > 0:
        return ("warning", "W-099: その他 軽微なエラー", f"レジスタ {reg} で異常検知。値: {value}", None)
    if reg == "D900" and value == 99:
        return ("error", "E-099: その他 致命的停止エラー", "PLCからの致命アラームを検知しました。", None)

    return None

# =========================
# 共通：送信（日本時間・新フォーマット）
# =========================
def get_now_jst():
    # 日本時間 (UTC+9) で YYYY-MM-DD HH:MM:SS 形式の文字列を生成
    jst = datetime.timezone(datetime.timedelta(hours=9))
    return datetime.datetime.now(jst).strftime('%Y-%m-%d %H:%M:%S')

def send_to_server(log_type: str, title: str, message: str, unit_id=None):
    payload = {
        "timestamp": get_now_jst(),
        "machine_name": MACHINE_NAME,
        "unit_id": unit_id,
        "log_type": log_type,
        "title": title,
        "message": message,
    }
    try:
        r = requests.post(SERVER_URL, json=payload, timeout=5)
        print(f"📤 送信 [JST {payload['timestamp']}]: {payload}")
        print(f"✅ 応答: {r.status_code} {r.text}")
        return r.status_code
    except Exception as e:
        print(f"❌ サーバー送信エラー: {e}")
        return None

# =========================
# PLC読み取り・監視
# =========================
def read_d_word(plc, device):
    return plc.batchread_wordunits(headdevice=device, readsize=1)[0]

def monitor_plc_once(plc, prev_d: dict):
    # Dレジスタ監視対象
    target_regs = ["D0", "D1", "D100", "D101", "D102", "D103", "D104", "D900", "D901", "D902", "D903", "D904"]
    
    for reg in target_regs:
        try:
            value = read_d_word(plc, reg)
            prev = prev_d.get(reg, 0)
            
            if value > prev: # 上昇時のみ
                config = get_error_config(reg, value)
                if config:
                    log_type, title, msg, unit_id = config
                    send_to_server(log_type, title, msg, unit_id)
            
            prev_d[reg] = value
        except Exception as e:
            print(f"❌ D読み取りエラー {reg}: {e}")

# =========================
# メイン (テストデータ検証含む)
# =========================
def main():
    plc = pymcprotocol.Type3E()
    print(f"🔧 CONFIG: PLC={PLC_IP}:{PLC_PORT} API={SERVER_URL}")
    
    # --- JST/UTC 検証用テストデータ送信 ---
    print("🧪 JSTタイムスタンプ検証用データを送信します...")
    send_to_server("info", "I-001: 生産機械 通電（JETSON検知）", "JST検証用起動テストデータ")

    print("🔌 PLC接続中...")
    try:
        plc.connect(PLC_IP, PLC_PORT)
        print("✅ PLCに接続しました")
    except Exception as e:
        print(f"⚠️ PLC未接続ですが、サービス待機を継続します: {e}")

    prev_d = {}
    try:
        while True:
            if plc.is_connected:
                monitor_plc_once(plc, prev_d)
            time.sleep(POLL_INTERVAL_SEC)
    finally:
        try: plc.close()
        except: pass

if __name__ == "__main__":
    try: main()
    except KeyboardInterrupt: sys.exit(0)
    except Exception as e:
        print(f"❌ 致命的エラー: {e}")
        sys.exit(1)