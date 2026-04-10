from fastapi import FastAPI
from pydantic import BaseModel
from openai import OpenAI
from fastapi.middleware.cors import CORSMiddleware  # <-- 新增：导入跨域工具

app = FastAPI(title="TreeHole AI API")

# <-- 新增：配置跨域（CORS），允许任何网页访问我们的接口
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源
    allow_credentials=True,
    allow_methods=["*"],  # 允许所有方法 (POST, GET等)
    allow_headers=["*"],  # 允许所有请求头
)

client = OpenAI(
    api_key="sk-fetpzgjxohmtqihfscdmwhzdwejkjejngtorrjrfucwdufap", 
    base_url="https://api.siliconflow.cn/v1"
)

class UserMessage(BaseModel):
    text: str

@app.post("/chat")
def chat_with_ai(message: UserMessage):
    print(f"收到用户的心事：{message.text}")
    
    response = client.chat.completions.create(
        model="Qwen/Qwen2.5-7B-Instruct",
        messages=[
            {"role": "system", "content": "你是一个温暖的心理学树洞伴侣。请用简短、温柔的语气回复用户。"},
            {"role": "user", "content": message.text}
        ]
    )
    
    ai_reply = response.choices[0].message.content
    return {"reply": ai_reply}