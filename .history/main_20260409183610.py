from fastapi import FastAPI
from pydantic import BaseModel
from openai import OpenAI

# 1. 创建一个网站服务器实例
app = FastAPI(title="TreeHole AI API")

# 2. 依然是初始化你的 AI 客户端
client = OpenAI(
    api_key="sk-fetpzgjxohmtqihfscdmwhzdwejkjejngtorrjrfucwdufap",  # 填入你正确的 Key
    base_url="https://api.siliconflow.cn/v1"
)

# 3. 定义用户发给我们的数据长什么样（这里定义用户发来一段文本）
class UserMessage(BaseModel):
    text: str

# 4. 开通一个网络接口，地址叫 /chat，只接收 POST 请求
@app.post("/chat")
def chat_with_ai(message: UserMessage):
    print(f"收到用户的心事：{message.text}")
    
    # 这里就是你刚才跑通的代码！只是把固定的话，换成了 message.text
    response = client.chat.completions.create(
        model="Qwen/Qwen2.5-7B-Instruct",  # 填入你刚才测试成功的那个模型名字
        messages=[
            {"role": "system", "content": "你是一个温暖的心理学树洞伴侣。请用简短、温柔的语气回复用户。"},
            {"role": "user", "content": message.text}
        ]
    )
    
    # 获取 AI 的回复并打包成网络格式返回
    ai_reply = response.choices[0].message.content
    return {"reply": ai_reply}