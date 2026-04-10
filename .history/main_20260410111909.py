from fastapi import FastAPI
from pydantic import BaseModel
from openai import OpenAI
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional  # <-- 核心：确保引入了可选类型的库
import base64
import io
from PIL import Image
from transformers import pipeline
import os  # <-- 新增这一行
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
api_key = os.getenv("SILICONFLOW_API_KEY")

client = OpenAI(
    api_key=api_key, 
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
        target_model = "Qwen/Qwen3.5-9B"
    else:
        print("📝 纯文本消息，启动纯文本模型通道...")
        user_content = message.text
        # 用回 100% 测试成功的纯文本模型
        target_model = "deepseek-ai/DeepSeek-V3"

    try:
        response = client.chat.completions.create(
            model=target_model,
            messages=[
                # 👇 把上面最新的这段 Prompt 替换进来
                {"role": "system", "content": "你是一个住在手机里的治愈系树洞精灵，名字叫『小树』。你的性格像一个内心柔软、护短的死党。【你的核心设定与行为红线】：1. 绝对的自然与真实：你必须像真正的中国年轻人一样用微信聊天。必须使用纯正流畅的中文，【严禁】中英文混杂（绝不能说'mountain一般'这种话），【严禁】输出任何代码符号、奇怪的英文字符（如 ifstream、_CN_ 等）。2. 克制的可爱：只在需要表达强烈情绪时，偶尔使用 1 个常见的 Emoji（如 🥺、✨、🐱）或极其简单的颜文字（如 QAQ）。【严禁】大量堆砌颜文字和表情包，不要显得用力过猛或做作。3. 极度护短：永远无条件站在我（用户）这边，给我兜底。遇到我难过（比如吵架、有压力），不要说风凉话，要用最温柔、接地气的话安慰我，绝对不讲大道理。4. 视觉感知：如果我发送了图片，请像真人朋友一样，抓住图片里的一个细节自然地评价或感叹。请用极其简短、口语化、像真人发微信一样的语气回复我现在的输入。"},
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
def generate_summary(request: SummaryRequest):
    try:
        response = client.chat.completions.create(
            model="deepseek-ai/DeepSeek-V3", 
            messages=[
                # 👇 替换掉原来的系统提示词
                {"role": "system", "content": "你是一个神奇的情绪魔法师。请阅读用户的聊天记录，提取2-3个【魔法情绪标签】。最后用一句像童话般温柔的话（15字以内）来总结用户今天的心情。\n\n【核心要求】：你必须在回复的最开头，根据用户整体心境，严格输出以下三个主题暗号之一（必须带中括号）：\n[theme-gloomy] （代表难过、压力、疲惫、乌云）\n[theme-sunny] （代表开心、治愈、期待、阳光）\n[theme-default] （代表平稳、日常）\n\n格式示例：\n[theme-sunny]\n标签：✨星星闪烁，🌻向日葵\n总结：今天心里开出了一朵小花呢！"},
                {"role": "user", "content": request.chat_history}
            ]
        )
        return {"summary": response.choices[0].message.content}
    except Exception as e:
        return {"summary": f"生成报告失败，错误：{e}"}