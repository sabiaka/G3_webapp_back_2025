

import requests
import json
import datetime

filename = 'MAT-00123_B-spring01_1.jpg'
url = f"http://your-server.com/api/ingress/inspection/result/{filename}"

# 送信するメタデータを作成
metadata = {
    "lot_id": "MAT-00123",
    "section_code": "spring",
    "camera_id": "B-spring01",
    "status": "FAIL",
    "details": "傷あり",
    "shot_seq": 1,
    "captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
}

# 送信するファイル一式を準備
files = {
    'metadata': (None, json.dumps(metadata), 'application/json'),
    'image': (filename, open('/path/to/after_inspection_image.jpg', 'rb'), 'image/jpeg')
}

response = requests.put(url, files=files)

print(f"ステータスコード: {response.status_code}")
print("レスポンス:", response.json())