from fastapi import FastAPI
from pydantic import BaseModel
from openai import OpenAI
from fastapi.middleware.cors import CORSMiddleware  # <-- 新增：导入跨域工具
from typing import Optional # 新增：用来表示某个数据是可选的
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
    image_url: Optional[str] = None  # 允许用户不发图片，所以是 Optional

@app.post("/chat")
def chat_with_ai(message: UserMessage):
    print(f"收到用户的心事：{message.text}")
    if message.image_url:
        print("💡 并且用户附带了一张图片！")
    
    # 2. 构建多模态的请求内容
    # 如果有图片，大模型要求的内容格式会变成一个列表
    user_content = [{"type": "text", "text": message.text}]
    
    if message.image_url:
        # 如果前端传来了图片，我们就把它拼接到内容里
        user_content.append({
            "type": "image_url",
            "image_url": {"url": message.image_url}
        })
    rresponse = client.chat.completions.create(
        model="OpenGVLab/InternVL2-8B",  # <-- 换成了硅基流动平台上免费好用的多模态视觉模型
        messages=[
            {"role": "system", "content": "你是一个温暖的心理学树洞伴侣。如果用户发送了图片，请结合图片的内容给予有同理心的回应。"},
            {"role": "user", "content": user_content}
        ]
    )
    
    ai_reply = response.choices[0].message.content
    return {"reply": ai_reply}

class SummaryRequest(BaseModel):
    chat_history: str  # 接收用户发来的长篇聊天记录

@app.post("/summary")
def generate_summary(request: SummaryRequest):
    print("正在为用户生成情绪摘要...")
    
    # 我们用另一个专门的 Prompt 来让 AI 做总结
    response = client.chat.completions.create(
        model=", # 继续使用这个稳定且免费的模型
        messages=[
            {"role": "system", "content": "你是一个专业的情绪分析师。请根据用户提供的对话记录，提取出不超过3个情绪标签（例如：焦虑、释然、开心），并用一句话（15字以内）总结用户今天的心境。格式要求：\n标签：[标签1, 标签2]\n总结：[一句话总结]"},
            {"role": "user", "content": request.chat_history}
        ]
    )
    
    summary_result = response.choices[0].message.content
    return {"summary": summary_result}