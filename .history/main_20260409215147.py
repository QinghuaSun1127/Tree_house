from fastapi import FastAPI
from pydantic import BaseModel
from openai import OpenAI
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional  # <-- 核心：确保引入了可选类型的库

app = FastAPI(title="TreeHole AI API")

# 允许跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化 AI 客户端
client = OpenAI(
    api_key="sk-fetpzgjxohmtqihfscdmwhzdwejkjejngtorrjrfucwdufap", 
    base_url="https://api.siliconflow.cn/v1"
)

# 定义接收的数据结构
class UserMessage(BaseModel):
    text: str
    image_url: Optional[str] = None  # 允许为空

class SummaryRequest(BaseModel):
    chat_history: str

@app.post("/chat")
def chat_with_ai(message: UserMessage):
    print(f"\n--- 收到新消息 ---")
    print(f"用户文字：{message.text}")
    
    # 严格的动态路由逻辑
    if message.image_url:
        print("💡 检测到图片，组装多模态数据，启动视觉模型通道...")
        user_content = [
            {"type": "text", "text": message.text},
            {"type": "image_url", "image_url": {"url": message.image_url}}
        ]
        # 使用目前硅基流动最稳定的 DeepSeek 视觉模型
        target_model = "deepseek-ai/deepseek-vl2" 
    else:
        print("📝 纯文本消息，启动纯文本模型通道...")
        user_content = message.text
        # 用回 100% 测试成功的纯文本模型
        target_model = "Qwen/Qwen2.5-7B-Instruct"

    try:
        response = client.chat.completions.create(
            model=target_model,
            messages=[
                {"role": "system", "content": "你是一个温暖的心理学树洞伴侣。如果用户发送了图片，请结合图片内容给予同理心回应。"},
                {"role": "user", "content": user_content}
            ]
        )
        ai_reply = response.choices[0].message.content
        return {"reply": ai_reply}
    except Exception as e:
        print(f"❌ 发生致命错误: {e}")
        # 将真实报错信息直接返回给前端显示，彻底告别“盲盒报错”
        return {"reply": f"【系统提示】模型调用失败，报错详情：{e}"}

@app.post("/summary")
def generate_summary(request: SummaryRequest):ta
    try:
        response = client.chat.completions.create(
            model="Qwen/Qwen2.5-7B-Instruct",
            messages=[
                {"role": "system", "content": "你是一个专业的情绪分析师。请根据用户提供的对话记录，提取出不超过3个情绪标签，并用一句话总结用户今天的心境。格式要求：\n标签：[标签1, 标签2]\n总结：[一句话总结]"},
                {"role": "user", "content": request.chat_history}
            ]
        )
        return {"summary": response.choices[0].message.content}
    except Exception as e:
        return {"summary": f"生成报告失败，错误：{e}"}