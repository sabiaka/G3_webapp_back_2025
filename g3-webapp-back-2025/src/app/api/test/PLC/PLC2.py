import pymcprotocol
import requests
import datetime
import time
import os

# =========================
# 設定
# =========================
PLC_IP = os.getenv("PLC_IP", "10.112.13.52")
PLC_PORT = int(os.getenv("PLC_PORT", "5000"))

API_HOST = os.getenv("API_HOST", "10.100.54.170")
API_PORT = int(os.getenv("API_PORT", "3001"))
BASE_URL = f"http://{API_HOST}:{API_PORT}/api"

MACHINE_ID = 1 
MACHINE_NAME = "半自動表層バネどめ機"
POLL_INTERVAL_SEC = 1.0  # 監視間隔を1秒に短縮（反応を良くするため）

# =========================
# 共通：API送信関数
# =========================
def get_now_jst():
    jst = datetime.timezone(datetime.timedelta(hours=9))
    return datetime.datetime.now(jst).strftime('%Y-%m-%d %H:%M:%S')

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
        print(f"📤 Log送信 [{log_type.upper()}]: {title} -> {r.status_code}")
    except Exception as e:
        print(f"❌ Log送信エラー: {e}")

def call_machine_start():
    try:
        url = f"{BASE_URL}/machines/{MACHINE_ID}/start"
        r = requests.post(url, timeout=5)
        print(f"🚀 稼働開始API実行: {r.status_code}")
    except Exception as e:
        print(f"❌ 稼働開始APIエラー: {e}")

def call_increment_production(section="spring"):
    try:
        # 画像の定義に基づき section=spring 固定
        url = f"{BASE_URL}/machines/{MACHINE_ID}/increment-production?section={section}"
        r = requests.post(url, timeout=5)
        print(f"📈 生産数+1実行: {r.status_code}")
    except Exception as e:
        print(f"❌ 生産数APIエラー: {e}")

# =========================
# PLC監視ロジック
# =========================
def read_d_word(plc, device):
    return plc.batchread_wordunits(headdevice=device, readsize=1)[0]

def read_x_bit(plc, device):
    return plc.batchread_bitunits(headdevice=device, readsize=1)[0]

def monitor_plc_once(plc, prev_d: dict):
    # --- 監視対象の定義 ---
    # Dレジスタ (画像 image_96c21f.png より)
    d_regs = ["D0", "D1", "D2", "D100", "D101", "D102", "D103", "D104", "D900", "D901", "D902", "D903", "D904"]
    # X入力信号 (画像 image_971455.png より)
    x_bits = ["X36", "X37"]

    # 1. Dレジスタの監視
    for reg in d_regs:
        try:
            value = read_d_word(plc, reg)
            prev = prev_d.get(reg, 0)
            
            # 値が変化した瞬間（立ち上がり）の検知
            if value > 0 and prev == 0:
                # --- info 系 ---
                if reg == "D0": 
                    send_log_to_server("info", "I-000: PLC 通電完了", "システム起動確認")
                elif reg == "D1":
                    send_log_to_server("info", "I-002: PLC スタンバイ", "待機状態")
                    call_machine_start()
                elif reg == "D2":
                    send_log_to_server("info", "I-001: 生産完了", "マットレス1枚生産終了")
                    call_increment_production(section="spring")

                # --- warning (警告) 系 ---
                elif reg == "D100":
                    send_log_to_server("warning", "W-001: 全ユニット共通エラー", "ユニット全体の確認が必要")
                elif reg.startswith("D10"):
                    u_num = reg[3:]
                    send_log_to_server("warning", f"W-10{u_num}: ユニット{u_num}残弾低下", "補給を準備してください")

                # --- error (異常) 系 ---
                elif reg == "D900":
                    if value == 1:
                        send_log_to_server("error", "E-001: 非常停止ボタン作動", "装置が停止しました")
                    elif value == 99:
                        send_log_to_server("error", "E-099: 致命的エラー", "PLCシステムの異常停止")
                elif reg.startswith("D90"):
                    u_num = reg[3:]
                    send_log_to_server("error", f"E-90{u_num}: ユニット{u_num}停止", "残弾なし等の理由で停止中")

            # 状態保存
            prev_d[reg] = value
        except Exception as e:
            print(f"❌ D読取エラー {reg}: {e}")

    # 2. X入力信号の監視 (物理スイッチ・センサー)
    for x_reg in x_bits:
        try:
            bit_val = read_x_bit(plc, x_reg)
            prev_bit = prev_d.get(x_reg, None)

            if bit_val != prev_bit:
                # X36: モータアラーム (ONで異常)
                if x_reg == "X36" and bit_val == 1:
                    send_log_to_server("error", "E-X36: モータアラーム", "ステッピングモータのアラームが発生")
                
                # X37: 非常停止中 (画像「OFFで動作」＝0の時に非常停止)
                elif x_reg == "X37":
                    if bit_val == 0:
                        send_log_to_server("error", "E-X37: 物理非常停止", "非常停止信号がOFFになりました")
                    else:
                        send_log_to_server("info", "I-X37: 非常停止解除", "装置の再始動が可能")
                
                prev_d[x_reg] = bit_val
        except Exception as e:
            print(f"❌ X読取エラー {x_reg}: {e}")

# =========================
# メイン実行ループ
# =========================
def main():
    plc = pymcprotocol.Type3E()
    connected = False
    prev_d = {}

    print(f"🚀 Monitoring Start: {MACHINE_NAME}")
    
    while True:
        if not connected:
            try:
                plc.connect(PLC_IP, PLC_PORT)
                print(f"✅ PLCに接続しました ({PLC_IP}:{PLC_PORT})")
                connected = True
            except:
                print("⏳ PLC接続リトライ中...")
                time.sleep(5)
                continue

        try:
            monitor_plc_once(plc, prev_d)
        except Exception as e:
            print(f"❗ 通信切断の可能性: {e}")
            connected = False
            try: plc.close()
            except: pass
        
        time.sleep(POLL_INTERVAL_SEC)

if __name__ == "__main__":
    main()