import pymcprotocol
import requests
import datetime
import time
import os
import sys

# =========================
# 設定
# =========================
PLC_IP = os.getenv("PLC_IP", "10.112.13.52")
PLC_PORT = int(os.getenv("PLC_PORT", "5000"))

API_HOST = os.getenv("API_HOST", "10.100.54.170")
API_PORT = int(os.getenv("API_PORT", "3001"))
BASE_URL = f"http://{API_HOST}:{API_PORT}/api"

# 機械のID（DB上のIDに合わせて設定してください）
MACHINE_ID = 1 
MACHINE_NAME = "半自動表層バネどめ機"
POLL_INTERVAL_SEC = 2.0

# =========================
# 共通：送信関数
# =========================
def get_now_jst():
    jst = datetime.timezone(datetime.timedelta(hours=9))
    return datetime.datetime.now(jst).strftime('%Y-%m-%d %H:%M:%S')

# 1. ログ送信 (従来の機能)
def send_log_to_server(log_type: str, title: str, message: str, unit_id=None):
    payload = {
        "timestamp": get_now_jst(),
        "machine_name": MACHINE_NAME,
        "unit_id": unit_id,
        "log_type": log_type,
        "title": title,
        "message": message,
    }
    try:
        url = f"{BASE_URL}/ingress/plc"
        r = requests.post(url, json=payload, timeout=5)
        print(f"📤 Log送信: {title} -> {r.status_code}")
    except Exception as e:
        print(f"❌ Log送信エラー: {e}")

# 2. 稼働開始API (新規)
def call_machine_start():
    try:
        url = f"{BASE_URL}/machines/{MACHINE_ID}/start"
        r = requests.post(url, timeout=5)
        print(f"🚀 稼働開始API実行: {url} -> {r.status_code}")
    except Exception as e:
        print(f"❌ 稼働開始APIエラー: {e}")

# 3. 生産数カウントアップAPI (新規)
def call_increment_production(section="total"):
    try:
        url = f"{BASE_URL}/machines/{MACHINE_ID}/increment-production?section={section}"
        r = requests.post(url, timeout=5)
        print(f"📈 生産数カウントアップ実行: {section} -> {r.status_code}")
    except Exception as e:
        print(f"❌ 生産数カウントアップエラー: {e}")

# =========================
# PLC監視ロジック
# =========================
def read_d_word(plc, device):
    return plc.batchread_wordunits(headdevice=device, readsize=1)[0]

def monitor_plc_once(plc, prev_d: dict):
    # 監視対象レジスタ
    target_regs = ["D0", "D1", "D100", "D900", "D901", "D902"]
    
    for reg in target_regs:
        try:
            value = read_d_word(plc, reg)
            prev = prev_d.get(reg, 0)
            
            # 信号が 0 -> 1 に立ち上がった瞬間を検知
            if value > prev:
                # --- 生産完了 (D0) ---
                if reg == "D0" and value == 1:
                    send_log_to_server("info", "I-001: PLC 運転完了", "1サイクル終了")
                    call_increment_production(section="main") # 生産数+1

                # --- スタンバイ開始 (D1) ---
                elif reg == "D1" and value == 1:
                    send_log_to_server("info", "I-002: PLC スタンバイ", "待機状態移行")
                    call_machine_start() # 稼働フラグON

                # --- 非常停止 (D900) ---
                elif reg == "D900" and value == 1:
                    send_log_to_server("error", "E-001: 非常停止ボタン作動", "即時停止")

            prev_d[reg] = value
        except Exception as e:
            print(f"❌ 読み取りエラー {reg}: {e}")

# =========================
# メイン
# =========================
def main():
    plc = pymcprotocol.Type3E()
    connected_flag = False
    
    print(f"🔧 CONFIG: PLC={PLC_IP} API={BASE_URL}")
    print("🔌 PLC接続試行中...")
    
    try:
        plc.connect(PLC_IP, PLC_PORT)
        print("✅ PLC接続完了")
        connected_flag = True
    except:
        print("⚠️ PLC未接続（リトライモード）")

    prev_d = {}
    try:
        while True:
            if connected_flag:
                monitor_plc_once(plc, prev_d)
            else:
                try:
                    plc.connect(PLC_IP, PLC_PORT)
                    connected_flag = True
                    print("✅ 再接続成功")
                except: pass
            
            time.sleep(POLL_INTERVAL_SEC)
    finally:
        try: plc.close()
        except: pass

if __name__ == "__main__":
    main()