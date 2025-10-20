
import requests
import json
import datetime

url = "http://localhost:3001/api/ingress/inspection"
image_path = '/path/to/source_image.jpg'

# 送信するメタデータを作成
metadata = {
    "section_code": "spring",
    "camera_id": "B-spring01",
    "shot_seq": 1,
    "captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
}

# 送信するファイルを準備
files = {
    'metadata': (None, json.dumps(metadata), 'application/json'),
    'image': ('source_image.jpg', open(image_path, 'rb'), 'image/jpeg')
}

response = requests.post(url, files=files)

print(f"ステータスコード: {response.status_code}")
print("レスポンス:", response.json())