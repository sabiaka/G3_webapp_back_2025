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
POLL_INTERVAL_SEC = 1.0

# モード切替
READ_MODE = os.getenv("READ_MODE", "D").upper()

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
        url = f"{BASE_URL}/machines/{MACHINE_ID}/increment-production?section={section}"
        r = requests.post(url, timeout=5)
        print(f"📈 生産数+1実行: {r.status_code}")
    except Exception as e:
        print(f"❌ 生産数APIエラー: {e}")

# =========================
# PLC読み取り
# =========================
def read_d_word(plc, device):
    return plc.batchread_wordunits(headdevice=device, readsize=1)[0]

def read_bit(plc, device):
    return plc.batchread_bitunits(headdevice=device, readsize=1)[0]

# =========================
# 信号定義
# =========================
X_MAP = {
    "X00": ("READY1", "ステッピングモータ1 レディ完了", "info"),
    "X01": ("MOVE1",  "ステッピングモータ1 動作中",     "info"),
    "X02": ("HOMEP1", "ステッピングモータ1 原点復帰完了", "info"),
    "X03": ("READY2", "ステッピングモータ2 レディ完了", "info"),
    "X04": ("MOVE2",  "ステッピングモータ2 動作中",     "info"),
    "X05": ("HOMEP2", "ステッピングモータ2 原点復帰完了", "info"),
    "X06": ("READY3", "ステッピングモータ3 レディ完了", "info"),
    "X07": ("MOVE3",  "ステッピングモータ3 動作中",     "info"),
    "X10": ("HOMEP3", "ステッピングモータ3 原点復帰完了", "info"),
    "X11": ("READY4", "ステッピングモータ4 レディ完了", "info"),
    "X12": ("MOVE4",  "ステッピングモータ4 動作中",     "info"),
    "X13": ("HOMEP4", "ステッピングモータ4 原点復帰完了", "info"),
    "X14": ("LS1",  "DCモータ4 前進端", "info"),
    "X15": ("LS2",  "DCモータ4 後退端", "info"),
    "X16": ("LS3",  "DCモータ3 前進端", "info"),
    "X17": ("LS4",  "DCモータ3 後退端", "info"),
    "X20": ("LS5",  "DCモータ2 前進端", "info"),
    "X21": ("LS6",  "DCモータ2 後退端", "info"),
    "X22": ("LS7",  "DCモータ1 前進端", "info"),
    "X23": ("LS8",  "DCモータ1 後退端", "info"),
    "X24": ("LS9",  "広げ部LS5 手前側", "info"),
    "X25": ("LS10", "広げ部LS6 奥側",   "info"),
    "X26": ("LS11", "押上部LS1 マット挿入位置", "info"),
    "X27": ("LS12", "押上部LS4 マット取出位置", "info"),
    "X30": ("PH1",  "押上部LS2 表面ホックリンガ位置", "info"),
    "X31": ("PH2",  "押上部LS3 裏面ホックリンガ位置", "info"),
    "X36": ("ALM",  "ステッピングモータ アラーム発生", "error"),
    "X37": ("P24E", "非常停止中", "error"),
}

Y_MAP = {
    "Y00": ("START1", "ステッピングモータ1 動作開始", "info"),
    "Y01": ("HOME1",  "ステッピングモータ1 原点復帰", "info"),
    "Y02": ("START2", "ステッピングモータ2 動作開始", "info"),
    "Y03": ("HOME2",  "ステッピングモータ2 原点復帰", "info"),
    "Y04": ("START3", "ステッピングモータ3 動作開始", "info"),
    "Y05": ("HOME3",  "ステッピングモータ3 原点復帰", "info"),
    "Y06": ("START4", "ステッピングモータ4 動作開始", "info"),
    "Y07": ("HOME4",  "ステッピングモータ4 原点復帰", "info"),
    "Y26": ("U1", "ソレノイド1", "info"),
    "Y27": ("U2", "ソレノイド2", "info"),
    "Y30": ("U3", "ソレノイド3", "info"),
    "Y31": ("U4", "ソレノイド4", "info"),
}

D_DECODE = {
    "D0":  {1: ("info", "I-000: PLC 通電完了", "システム起動確認")},
    "D1":  {1: ("info", "I-002: PLC スタンバイ", "待機状態")},
    "D2":  {1: ("info", "I-001: 生産完了", "マットレス1枚生産終了")},
    "D100": {
        1: ("warning", "W-001: 全ユニット共通エラー", "ユニット全体の確認が必要"),
    },
    "D900": {
        1:  ("error", "E-001: 非常停止ボタン作動", "装置が停止しました"),
        99: ("error", "E-099: その他PLCからの致命的エラー", "PLCシステムの異常停止"),
    },
}

# =========================
# 監視ロジック（修正：0解除を無視）
# =========================
def monitor_words(plc, prev_state: dict):
    for reg in D_DECODE.keys():
        try:
            value = read_d_word(plc, reg)
            prev = prev_state.get(reg, None)

            if prev is None:
                prev_state[reg] = value
                continue

            if value != prev:
                # 0に戻った時は通知せず状態更新のみ
                if value == 0:
                    prev_state[reg] = value
                    continue

                # ON (値が入った) 時のみ処理
                decode = D_DECODE.get(reg, {})
                if value in decode:
                    log_type, title, msg = decode[value]
                    send_log_to_server(log_type, title, msg)

                    if reg == "D1" and value == 1:
                        call_machine_start()
                    if reg == "D2" and value == 1:
                        call_increment_production(section="spring")
                else:
                    send_log_to_server("info", f"I-{reg}: {reg} 変化", f"{reg}={value}")

                prev_state[reg] = value
        except Exception as e:
            print(f"❌ D読取エラー {reg}: {e}")

def monitor_bits(plc, prev_state: dict, bit_map: dict, prefix: str):
    for dev, (name, desc, level) in bit_map.items():
        try:
            val = int(read_bit(plc, dev))
            prev = prev_state.get(dev, None)

            if prev is None:
                prev_state[dev] = val
                continue

            if val != prev:
                # 1 (ON) になった時だけ通知
                if val == 1:
                    send_log_to_server(level, f"{prefix}-{dev}: {name} ON", desc)
                
                # 0 (OFF) の時は何もしない
                prev_state[dev] = val
        except Exception as e:
            print(f"❌ {prefix}読取エラー {dev}: {e}")

def monitor_plc_once(plc, prev_state: dict):
    monitor_words(plc, prev_state)
    if READ_MODE == "ALL":
        monitor_bits(plc, prev_state, X_MAP, prefix="X")
        monitor_bits(plc, prev_state, Y_MAP, prefix="Y")

# =========================
# メイン
# =========================
def main():
    plc = pymcprotocol.Type3E()
    connected = False
    prev_state = {}

    print(f"🚀 Monitoring Start: {MACHINE_NAME} (No-Off-Log Mode)")

    while True:
        if not connected:
            try:
                plc.connect(PLC_IP, PLC_PORT)
                print(f"✅ PLCに接続しました ({PLC_IP}:{PLC_PORT})")
                connected = True
            except Exception:
                print("⏳ PLC接続リトライ中...")
                time.sleep(5)
                continue

        try:
            monitor_plc_once(plc, prev_state)
        except Exception as e:
            print(f"❗ 通信切断: {e}")
            connected = False
            try: plc.close()
            except: pass

        time.sleep(POLL_INTERVAL_SEC)

if __name__ == "__main__":
    main()