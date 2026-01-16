import pymcprotocol
import requests
import datetime
import time
import uuid
import os
import sys

# =========================
# 設定
# =========================
PLC_IP = os.getenv("PLC_IP", "10.112.13.51")
PLC_PORT = int(os.getenv("PLC_PORT", "5000"))

# APIサーバは別マシン前提（localhostはNG）
API_HOST = os.getenv("API_HOST", "10.0.0.123")  # ←ここを実サーバIPに変更
API_PORT = int(os.getenv("API_PORT", "3000"))
SERVER_URL = f"http://{API_HOST}:{API_PORT}/api/ingress/plc"

MACHINE_NAME = os.getenv("MACHINE_NAME", "半自動バネどめ機")
POLL_INTERVAL_SEC = float(os.getenv("POLL_INTERVAL_SEC", "2"))

# 監視方針
SEND_ON_RISE_ONLY_FOR_D = True   # Dレジスタは上昇時のみ送信（元コード互換）
SEND_ON_CHANGE_FOR_XY = True     # X/YはON/OFF変化で送信

# =========================
# X入力 / Y出力 ビット対応表
# =========================
X_BIT_MAP = {
    "X00": "READY1 ステッピングモータ1 レディ完了",
    "X01": "MOVE1 ステッピングモータ1 動作中",
    "X02": "HOMEP1 ステッピングモータ1 原点復帰完了",
    "X03": "READY2 ステッピングモータ2 レディ完了",
    "X04": "MOVE2 ステッピングモータ2 動作中",
    "X05": "HOMEP2 ステッピングモータ2 原点復帰完了",
    "X06": "READY3 ステッピングモータ3 レディ完了",
    "X07": "MOVE3 ステッピングモータ3 動作中",
    "X10": "HOMEP3 ステッピングモータ3 原点復帰完了",
    "X11": "READY4 ステッピングモータ4 レディ完了",
    "X12": "MOVE4 ステッピングモータ4 動作中",
    "X13": "HOMEP4 ステッピングモータ4 原点復帰完了",
    "X14": "LS1 DCモータ4 前進端",
    "X15": "LS2 DCモータ4 後退端",
    "X16": "LS3 DCモータ3 前進端",
    "X17": "LS4 DCモータ3 後退端",
    "X20": "LS5 DCモータ2 前進端",
    "X21": "LS6 DCモータ2 後退端",
    "X22": "LS7 DCモータ1 前進端",
    "X23": "LS8 DCモータ1 後退端",
    "X24": "LS9 広げ部LS5 手前側",
    "X25": "LS10 広げ部LS6 奥側",
    "X26": "LS11 押上部LS1 マット挿入位置",
    "X27": "LS12 押上部LS4 マット取出位置",
    "X30": "PH1 押上部LS2 裏面ホックリング位置",
    "X31": "PH2 押上部LS3 裏面ホックリング位置",
    "X32": "未使用",
    "X33": "未使用",
    "X34": "未使用",
    "X35": "未使用",
    "X36": "ALM ステッピングモータアラーム",
    "X37": "P24E 非常停止中"
}

Y_BIT_MAP = {
    "Y00": "START1 ステッピングモータ1 動作開始",
    "Y01": "HOME1 ステッピングモータ1 原点復帰",
    "Y02": "START2 ステッピングモータ2 動作開始",
    "Y03": "HOME2 ステッピングモータ2 原点復帰",
    "Y04": "START3 ステッピングモータ3 動作開始",
    "Y05": "HOME3 ステッピングモータ3 原点復帰",
    "Y06": "START4 ステッピングモータ4 動作開始",
    "Y07": "HOME4 ステッピングモータ4 原点復帰",
    "Y10": "CW1 DCモータ1 正転",
    "Y11": "CCW1 DCモータ1 逆転",
    "Y12": "CW2 DCモータ2 正転",
    "Y13": "CCW2 DCモータ2 逆転",
    "Y14": "CW3 DCモータ3 正転",
    "Y15": "CCW3 DCモータ3 逆転",
    "Y16": "CW4 DCモータ4 正転",
    "Y17": "CCW4 DCモータ4 逆転",
    "Y20": "SW4 ACモータ1 動作",
    "Y21": "C/CC4 ACモータ1 正逆切替",
    "Y22": "EB1 ACモータ1 電磁ブレーキ",
    "Y23": "SW5 ACモータ2 動作",
    "Y24": "C/CC5 ACモータ2 正逆切替",
    "Y25": "EB2 ACモータ2 電磁ブレーキ",
    "Y26": "U1 ソレノイド1",
    "Y27": "U2 ソレノイド2",
    "Y30": "U3 ソレノイド3",
    "Y31": "U4 ソレノイド4",
    "Y32": "FWD1 ステッピングモータ1 正転JOG",
    "Y33": "RVS1 ステッピングモータ1 逆転JOG",
    "Y34": "FWD2 ステッピングモータ2 正転JOG",
    "Y35": "RVS2 ステッピングモータ2 逆転JOG",
    "Y36": "FWD3 ステッピングモータ3 正転JOG",
    "Y37": "RVS3 ステッピングモータ3 逆転JOG",
    "Y40": "FWD4 ステッピングモータ4 正転JOG",
    "Y41": "RVS4 ステッピングモータ4 逆転JOG",
    "Y42": "STOP ステッピングモータ 停止",
    "Y43": "ALM_RST ステッピングモータ アラーム解除",
    "Y44": "M10 データ領域",
    "Y45": "M20 データ領域",
    "Y46": "M30 データ領域",
    "Y47": "M40 データ領域"
}

# =========================
# Dレジスタ対応表
# =========================
ERROR_MAP = {
    "D0": {1: ("info", "PLC スタンバイ")},
    "D100": {1: ("warning", "全ユニット共通エラー")},
    "D101": {1: ("warning", "ユニット1残弾低下")},
    "D102": {1: ("warning", "ユニット2残弾低下")},
    "D103": {1: ("warning", "ユニット3残弾低下")},
    "D104": {1: ("warning", "ユニット4残弾低下")},
    "D900": {1: ("error", "停止ボタン作動"), 99: ("error", "その他PLCからの致命的エラー")},
    "D901": {1: ("error", "ユニット1残弾低下")},
    "D902": {1: ("error", "ユニット2残弾低下")},
    "D903": {1: ("error", "ユニット3残弾低下")},
    "D904": {1: ("error", "ユニット4残弾低下")}
}

# =========================
# 共通：時刻/送信
# =========================
def now_utc_iso_z():
    return datetime.datetime.utcnow().isoformat() + "Z"

def send_to_server(log_type: str, title: str, message: str, meta: dict | None = None):
    payload = {
        "correlation_id": str(uuid.uuid4()),
        "timestamp": now_utc_iso_z(),
        "machine_name": MACHINE_NAME,
        "log_type": log_type,
        "title": title,
        "message": message,
    }
    if meta:
        payload["meta"] = meta

    try:
        r = requests.post(SERVER_URL, json=payload, timeout=5)
        print(f"📤 送信: {payload}")
        print(f"✅ 応答: {r.status_code} {r.text}")
        return r.status_code
    except Exception as e:
        print(f"❌ サーバー送信エラー: {e}")
        return None

# =========================
# PLC読み取り
# =========================
def read_d_word(plc: pymcprotocol.Type3E, device: str) -> int:
    return plc.batchread_wordunits(headdevice=device, readsize=1)[0]

def read_bit(plc: pymcprotocol.Type3E, device: str) -> int:
    """
    pymcprotocolは環境により bit読み取りAPI名が違うことがある。
    動かなかったらここだけ修正すればOK。
    """
    if hasattr(plc, "batchread_bitunits"):
        return int(plc.batchread_bitunits(headdevice=device, readsize=1)[0])
    if hasattr(plc, "batchread_bits"):
        return int(plc.batchread_bits(headdevice=device, readsize=1)[0])
    raise RuntimeError("このpymcprotocol環境でビット読み取り関数が見つかりません")

# =========================
# 監視ロジック
# =========================
def monitor_d_registers(plc, prev_d: dict):
    for reg, mapping in ERROR_MAP.items():
        try:
            value = read_d_word(plc, reg)
            prev = prev_d.get(reg, 0)

            should_send = (value > prev) if SEND_ON_RISE_ONLY_FOR_D else (value != prev)

            if should_send:
                print(f"📈 D変化: {reg} {prev} → {value}")

                if value in mapping:
                    log_type, title = mapping[value]
                    send_to_server(
                        log_type,
                        title,
                        f"{reg} の値: {value}",
                        meta={"device": reg, "prev": prev, "value": value, "kind": "D"}
                    )
                else:
                    print(f"⚠ {reg} → 未定義の値 {value}")

            prev_d[reg] = value

        except Exception as e:
            print(f"❌ D読み取りエラー: {reg}: {e}")

def monitor_bits(plc, bit_map: dict, prev_bits: dict, kind: str):
    for bit, desc in bit_map.items():
        try:
            value = read_bit(plc, bit)
            prev = prev_bits.get(bit, None)

            # 初回は学習だけ（送らない）
            if prev is None:
                prev_bits[bit] = value
                continue

            if SEND_ON_CHANGE_FOR_XY and value != prev:
                state_str = "ON" if value else "OFF"
                prev_str = "ON" if prev else "OFF"
                print(f"🔁 {kind}変化: {bit} {prev_str} → {state_str} ({desc})")

                log_type = "info"
                if bit == "X37" and value == 1:
                    log_type = "error"
                elif bit == "X36" and value == 1:
                    log_type = "warning"

                send_to_server(
                    log_type,
                    f"{bit} {state_str}",
                    desc,
                    meta={"device": bit, "prev": int(prev), "value": int(value), "kind": kind}
                )

            prev_bits[bit] = value

        except Exception as e:
            print(f"❌ {kind}読み取りエラー: {bit}: {e}")

# =========================
# メイン
# =========================
def main():
    plc = pymcprotocol.Type3E()

    print(f"🔧 CONFIG: PLC={PLC_IP}:{PLC_PORT} API={SERVER_URL}")
    print("🔌 PLC接続中...")
    plc.connect(PLC_IP, PLC_PORT)
    print("✅ PLCに接続しました")

    prev_d = {}
    prev_x = {}
    prev_y = {}

    try:
        while True:
            monitor_d_registers(plc, prev_d)
            monitor_bits(plc, X_BIT_MAP, prev_x, "X")
            monitor_bits(plc, Y_BIT_MAP, prev_y, "Y")
            time.sleep(POLL_INTERVAL_SEC)
    finally:
        try:
            plc.close()
        except Exception:
            pass

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("🛑 手動停止")
        sys.exit(0)
    except Exception as e:
        print(f"❌ 致命的エラー: {e}")
        sys.exit(1)
