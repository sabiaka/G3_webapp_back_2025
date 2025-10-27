import pymcprotocol
import requests
import datetime

# === PLC接続設定 ===
plc = pymcprotocol.Type3E()

# === サーバーのエンドポイント ===
SERVER_URL = "http://localhost:3000/api/test/PLC"  # ←実際のURLに変更

# === レジスタと対応表 ===
ERROR_MAP = {
    "D0": {
        2: ("info", "PLC スタンバイ")
    },
    "D100": {
        1: ("warning", "全ユニット共通エラー")
    },
    "D101": {
        1: ("warning", "ユニット1残弾低下")
    },
    "D102": {
        1: ("warning", "ユニット2残弾低下")
    },
    "D103": {
        1: ("warning", "ユニット3残弾低下")
    },
    "D104": {
        1: ("warning", "ユニット4残弾低下")
    },
    "D900": {
        1: ("error", "停止ボタン作動"),
        99: ("error", "その他PLCからの致命的エラー")
    },
    "D901": {
        1: ("error", "ユニット1残弾低下")
    },
    "D902": {
        1: ("error", "ユニット2残弾低下")
    },
    "D903": {
        1: ("error", "ユニット3残弾低下")
    },
    "D904": {
        1: ("error", "ユニット4残弾低下")
    }
}

def send_to_server(log_type, title, message):
    payload = {
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "machine_name": "半自動バネどめ機",
        "log_type": log_type,
        "title": title,
        "message": message
    }

    try:
        response = requests.post(SERVER_URL, json=payload, timeout=5)
        print(f"📤 送信: {payload}")
        print(f"✅ サーバー応答: {response.status_code} {response.text}")
    except Exception as e:
        print(f"❌ サーバー送信エラー: {e}")

try:
    plc.connect("10.100.54.173", 5000)
    print("✅ PLCに接続しました")

    for reg, mapping in ERROR_MAP.items():
        data = plc.batchread_wordunits(headdevice=reg, readsize=1)[0]

        if data != 0 and data in mapping:
            log_type, title = mapping[data]
            send_to_server(log_type, title, f"{reg} の値: {data}")
        elif data != 0:
            print(f"⚠ {reg} → 未定義の値 {data}")

    print("✅ 全レジスタ送信完了")

except Exception as e:
    print(f"❌ PLCに接続できません: {e}")

finally:
    try:
        plc.close()
    except Exception:
        pass
