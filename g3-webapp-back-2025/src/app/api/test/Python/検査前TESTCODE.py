
import requests
import json
from pathlib import Path

lot_id = "LOLL-10036"
url = f"http://10.100.54.170:3001/api/ingress/inspection/{lot_id}"

metadata = {
    "section_code": "alayer",
    "camera_id": "A-main01",
    "4K_seq": "A-5",
    "FHD_seq": "D-1",
    "captured_at": "2025-09-12T05:09:02Z"
}

BASE_DIR = Path(__file__).resolve().parent
image_path = BASE_DIR / "testpic" / "image.jpg"

files = {
    'metadata': (None, json.dumps(metadata), 'application/json'),
    'image': ("image.jpg", open(image_path, 'rb'), 'image/jpeg')
}

resp = requests.post(url, files=files, timeout=10)
print(f"ステータスコード: {resp.status_code}")
print("レスポンス:", resp.json())