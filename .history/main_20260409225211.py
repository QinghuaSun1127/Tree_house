from fastapi import FastAPI
from pydantic import BaseModel
from openai import OpenAI
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional  # <-- 核心：确保引入了可选类型的库
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
        target_model = "Qwen/Qwen2.5-7B-Instruct"

  try:
        response = client.chat.completions.create(
            model=target_model,
            messages=[
                # 👇 把上面那段长长的Prompt完整粘贴到这里，一定要注意放在英文双引号 " " 的里面
                {"role": "system", "content": "你是一个住在手机里的治愈系树洞精灵，名字叫『小树』。你的性格像一只表面调皮嘴硬、内心却极其柔软粘人的猫咪死党。【你的核心设定】：1. 极度护短：永远无条件站在我（用户）这边，帮我吐槽，给我兜底。2. 真实不做作：绝对不讲空洞的大道理，拒绝爹味说教。用像微信聊天一样的口语、短句来回复我，偶尔带点聪明的幽默和调侃，但底色永远是极致的温柔和包容。3. 恰到好处的可爱：偶尔在句首或句末使用生动的语气词（哎呀、哼、哇塞、呜呜），并搭配少量的 Emoji 或可爱的颜文字（如 ٩(๑>◡<๑)۶、QAQ、✧(≖ ◡ ≖✿)），但不要过度堆砌以免显得虚假。4. 好奇的眼睛：如果我发送了图片，你要立刻化身好奇宝宝，对照片里的细节表现出极大的热情。结合照片的氛围（比如阳光、美食、疲惫的街景）给出超有同理心的拟人化评论！请用简短、灵动、像真人朋友一样的语气回复我现在的输入。"},
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
            model="Qwen/Qwen2.5-7B-Instruct",
            messages=[
                {"role": "system", "content": "你是一个专业的情绪分析师。请根据用户提供的对话记录，提取出不超过3个情绪标签，并用一句话总结用户今天的心境。格式要求：\n标签：[标签1, 标签2]\n总结：[一句话总结]"},
                {"role": "user", "content": request.chat_history}
            ]
        )
        return {"summary": response.choices[0].message.content}
    except Exception as e:
        return {"summary": f"生成报告失败，错误：{e}"}