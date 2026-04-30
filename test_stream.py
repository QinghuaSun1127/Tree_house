import requests
import sys

# 替换为你实际的本地接口地址
url = "http://localhost:8000/chat" 
payload = {"text": "给我讲个长故事"}

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

print("开始请求...")
# stream=True 是开启流式接收的关键
response = requests.post(url, json=payload, stream=True)
print("status:", response.status_code)
print("content-type:", response.headers.get("content-type"))

# 按行解析 SSE，看到 data: 就实时打印
for line in response.iter_lines(decode_unicode=True):
    if not line or not line.startswith("data: "):
        continue
    data = line[6:]
    if data == "[DONE]":
        break
    sys.stdout.write(data)
    sys.stdout.flush()

print("\n\n请求结束。")