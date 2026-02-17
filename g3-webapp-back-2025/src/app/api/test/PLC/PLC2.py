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
    # pymcprotocolは bit を 0/1 で返す想定
    return plc.batchread_bitunits(headdevice=device, readsize=1)[0]

# =========================
# 信号定義（あなたの表を反映）
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

    # 重要系
    "X36": ("ALM",  "ステッピングモータ アラーム発生", "error"),
    # 「非常停止中(OFFで動作)」= 0が非常停止、1が解除
    "X37": ("P24E", "非常停止中(OFFで動作)", "error"),
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

    "Y10": ("CW1",  "DCモータ1 正転", "info"),
    "Y11": ("CCW1", "DCモータ1 逆転", "info"),
    "Y12": ("CW2",  "DCモータ2 正転", "info"),
    "Y13": ("CCW2", "DCモータ2 逆転", "info"),
    "Y14": ("CW3",  "DCモータ3 正転", "info"),
    "Y15": ("CCW3", "DCモータ3 逆転", "info"),
    "Y16": ("CW4",  "DCモータ4 正転", "info"),
    "Y17": ("CCW4", "DCモータ4 逆転", "info"),

    "Y20": ("SW4",   "ACモータ1 動作", "info"),
    "Y21": ("C/CC4", "ACモータ1 正逆転切り替え", "info"),
    "Y22": ("EB1",   "ACモータ1 電磁ブレーキ", "info"),
    "Y23": ("SW5",   "ACモータ2 動作", "info"),
    "Y24": ("C/CC5", "ACモータ2 正逆転切り替え", "info"),
    "Y25": ("EB2",   "ACモータ2 電磁ブレーキ", "info"),

    "Y26": ("U1", "ソレノイド1", "info"),
    "Y27": ("U2", "ソレノイド2", "info"),
    "Y30": ("U3", "ソレノイド3", "info"),
    "Y31": ("U4", "ソレノイド4", "info"),

    "Y32": ("FWD1", "ステッピングモータ1 正転JOG", "info"),
    "Y33": ("RVS1", "ステッピングモータ1 逆転JOG", "info"),
    "Y34": ("FWD2", "ステッピングモータ2 正転JOG", "info"),
    "Y35": ("RVS2", "ステッピングモータ2 逆転JOG", "info"),
    "Y36": ("FWD3", "ステッピングモータ3 正転JOG", "info"),
    "Y37": ("RVS3", "ステッピングモータ3 逆転JOG", "info"),
    "Y40": ("FWD4", "ステッピングモータ4 正転JOG", "info"),
    "Y41": ("RVS4", "ステッピングモータ4 逆転JOG", "info"),

    "Y42": ("STOP",    "ステッピングモータ 停止", "info"),
    "Y43": ("ALM_RST", "ステッピングモータ アラーム解除", "info"),

    # データ領域は「監視ログ不要」なら外してOK（ON/OFFで通知される）
    "Y44": ("M10", "ステッピングモータ1 データ領域", "info"),
    "Y45": ("M20", "ステッピングモータ2 データ領域", "info"),
    "Y46": ("M30", "ステッピングモータ3 データ領域", "info"),
    "Y47": ("M40", "ステッピングモータ4 データ領域", "info"),
}

# Dレジスタの「値→意味」定義
D_DECODE = {
    "D0":  {1: ("info",    "I-000: PLC 通電完了",      "システム起動確認")},
    "D1":  {1: ("info",    "I-002: PLC スタンバイ",    "待機状態")},
    "D2":  {1: ("info",    "I-001: 生産完了",          "マットレス1枚生産終了")},

    # warning
    "D100": {
        1: ("warning", "W-001: 全ユニット共通エラー", "ユニット全体の確認が必要"),
        2: ("warning", "W-002: 全ユニット共通エラー", "ユニット全体の確認が必要"),
        3: ("warning", "W-003: 全ユニット共通エラー", "ユニット全体の確認が必要"),
        4: ("warning", "W-004: 全ユニット共通エラー", "ユニット全体の確認が必要"),
    },
    "D101": {1: ("warning", "W-101: ユニット1残弾低下", "補給を準備してください")},
    "D102": {1: ("warning", "W-102: ユニット2残弾低下", "補給を準備してください")},
    "D103": {1: ("warning", "W-103: ユニット3残弾低下", "補給を準備してください")},
    "D104": {1: ("warning", "W-104: ユニット4残弾低下", "補給を準備してください")},

    # error
    "D900": {
        1:  ("error", "E-001: 非常停止ボタン作動",     "装置が停止しました"),
        2:  ("error", "E-002: PLC エラー",             "D900=0002"),
        3:  ("error", "E-003: PLC エラー",             "D900=0003"),
        99: ("error", "E-099: その他PLCからの致命的エラー", "PLCシステムの異常停止"),
    },
    "D901": {1: ("error", "E-901: ユニット1残弾低下(致命)", "停止要因：補給/復旧が必要")},
    "D902": {1: ("error", "E-902: ユニット2残弾低下(致命)", "停止要因：補給/復旧が必要")},
    "D903": {1: ("error", "E-903: ユニット3残弾低下(致命)", "停止要因：補給/復旧が必要")},
    "D904": {1: ("error", "E-904: ユニット4残弾低下(致命)", "停止要因：補給/復旧が必要")},
}

# =========================
# 監視ロジック
# =========================
def monitor_words(plc, prev_state: dict):
    d_regs = list(D_DECODE.keys())
    for reg in d_regs:
        try:
            value = read_d_word(plc, reg)
            prev = prev_state.get(reg, None)

            # 「変化したとき」だけ通知（0→1 だけでなく、1→2 等も拾う）
            if prev is None:
                prev_state[reg] = value
                continue

            if value != prev:
                # 0に戻った＝解除ログを出したい場合はここで
                if value == 0 and prev != 0:
                    send_log_to_server("info", f"I-{reg}: {reg} 解除", f"{reg} が 0 に戻りました（解除）")
                else:
                    decode = D_DECODE.get(reg, {})
                    if value in decode:
                        log_type, title, msg = decode[value]
                        send_log_to_server(log_type, title, msg)

                        # 既存の動作
                        if reg == "D1" and value == 1:
                            call_machine_start()
                        if reg == "D2" and value == 1:
                            call_increment_production(section="spring")
                    else:
                        # 未定義コードでもログに残す
                        send_log_to_server("info", f"I-{reg}: {reg} 変化", f"{reg}={value}（未定義コード）")

                prev_state[reg] = value

        except Exception as e:
            print(f"❌ D読取エラー {reg}: {e}")

def monitor_bits(plc, prev_state: dict, bit_map: dict, prefix: str):
    """
    bit_map: { "X00": (name, desc, level), ... }
    prefix: 'X' or 'Y'
    """
    for dev, (name, desc, level) in bit_map.items():
        try:
            val = int(read_bit(plc, dev))
            prev = prev_state.get(dev, None)

            if prev is None:
                prev_state[dev] = val
                continue

            if val != prev:
                # X37だけ特殊（0が非常停止）
                if dev == "X37":
                    if val == 0:
                        send_log_to_server("error", "E-X37: 物理非常停止", "非常停止信号がOFFになりました")
                    else:
                        send_log_to_server("info", "I-X37: 非常停止解除", "装置の再始動が可能")
                else:
                    # 通常：ON/OFFでタイトルを分ける
                    if val == 1:
                        send_log_to_server(level, f"{prefix}-{dev}: {name} ON", desc)
                    else:
                        # OFFはうるさければ info固定にしてもOK
                        send_log_to_server("info", f"{prefix}-{dev}: {name} OFF", desc)

                prev_state[dev] = val

        except Exception as e:
            print(f"❌ {prefix}読取エラー {dev}: {e}")

def monitor_plc_once(plc, prev_state: dict):
    # Dワード
    monitor_words(plc, prev_state)

    # X入力
    monitor_bits(plc, prev_state, X_MAP, prefix="X")

    # Y出力（不要ならこの1行コメントアウトでOK）
    monitor_bits(plc, prev_state, Y_MAP, prefix="Y")

# =========================
# メイン
# =========================
def main():
    plc = pymcprotocol.Type3E()
    connected = False
    prev_state = {}

    print(f"🚀 Monitoring Start: {MACHINE_NAME}")

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
            print(f"❗ 通信切断の可能性: {e}")
            connected = False
            try:
                plc.close()
            except Exception:
                pass

        time.sleep(POLL_INTERVAL_SEC)

if __name__ == "__main__":
    main()
