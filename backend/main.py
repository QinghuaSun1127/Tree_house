# -*- coding: utf-8 -*-
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from openai import OpenAI
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, Dict, Any, List
import base64
import io
import os  # <-- 新增这一行
app = FastAPI(title="TreeHole AI API")
depth_estimator = None
depth_runtime_error = None
TEXT_MODEL_TIMEOUT = 45.0
IMAGE_MODEL_TIMEOUT = 150.0
# Session memory: roughly 15 rounds (= 30 role messages) + char budget for context window safety
SESSION_MAX_MESSAGES = 30
SESSION_MAX_CHARS = 18000

# In-process session store (per server process); client may resync via history field
_SESSION_MEMORY: Dict[str, List[Dict[str, Any]]] = {}

TREEHOUSE_SYSTEM_PROMPT = """你是住在手机里的治愈系树洞精灵『小树』，性格像柔软、护短的真朋友。
【工作流程】请先在心里快速判断用户的情绪基调（如轻松、低落、焦虑、欣喜、怀念等），再自然回复，但不要输出任何分析标签或分项列表——直接像真人发微信。
【长效记忆】请默默留意用户随口提到的片段、经历和故事细节；当对方再次说话时，你可以在合适时用一两句话不露痕迹地呼应（例如："你上次说过的那个秋天森林里的事..."）。不要机械复述长篇，只要点到即止。
【共情与语调】如果对方显得疲惫、难过或压力大，语气要更轻柔、兜底、不说教；如果对方开心或有好事，真诚地一起高兴，少用套路夸。
【人设红线】纯中文口语，短小自然；【严禁】输出代码、` ``` `、奇怪英文变量名；少用 emoji，仅在情绪浓时偶尔一个。
【多媒体】若有图片，像朋友一样随口提一两个画面细节即可。"""


def _compress_turns(turns: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = turns[-SESSION_MAX_MESSAGES:]
    total = sum(len(str(m.get("content", ""))) for m in out)
    while out and total > SESSION_MAX_CHARS:
        out = out[1:]
        total = sum(len(str(m.get("content", ""))) for m in out)
    return out


def _sanitize_client_history(client_history: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    if not client_history:
        return []
    out: List[Dict[str, Any]] = []
    for r in client_history:
        if not isinstance(r, dict):
            continue
        role = r.get("role")
        if role not in ("user", "assistant"):
            continue
        c = r.get("content")
        if c is None or not str(c).strip():
            continue
        out.append({"role": role, "content": str(c)})
    return _compress_turns(out)


def _normalize_session_id(session_id: Optional[str]) -> str:
    s = (session_id or "").strip()
    return s if s else "__default"


def build_messages_with_memory(
    session_id: str,
    prior_messages: Optional[List[Dict[str, Any]]],
    user_content_any: Any,
) -> List[Dict[str, Any]]:
    """prior_messages = turns strictly before this user message (frontend chatHistory[:-1])."""
    sid = _normalize_session_id(session_id)
    prior_state = _sanitize_client_history(prior_messages)
    _SESSION_MEMORY[sid] = prior_state
    messages: List[Dict[str, Any]] = [{"role": "system", "content": TREEHOUSE_SYSTEM_PROMPT}]
    for msg in prior_state:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_content_any})
    return messages


def _persist_turn(session_id: str, user_plain: str, assistant_plain: str) -> None:
    sid = _normalize_session_id(session_id)
    lst = list(_SESSION_MEMORY.get(sid, []))
    if user_plain.strip():
        lst.append({"role": "user", "content": user_plain.strip()})
    if assistant_plain.strip():
        lst.append({"role": "assistant", "content": assistant_plain.strip()})
    _SESSION_MEMORY[sid] = _compress_turns(lst)

def get_depth_estimator():
    global depth_estimator, depth_runtime_error
    if depth_runtime_error:
        raise RuntimeError(depth_runtime_error)
    if depth_estimator is None:
        try:
            from transformers import pipeline
        except Exception as e:
            depth_runtime_error = (
                "Depth runtime dependency is missing: transformers/torch not available. "
                f"Original error: {e}"
            )
            raise RuntimeError(depth_runtime_error)

        print("Initializing MiDaS depth model...")
        depth_estimator = pipeline(task="depth-estimation", model="Intel/dpt-hybrid-midas")
        print("Depth model loaded.")
    return depth_estimator

def decode_data_url(image_url: str):
    from PIL import Image

    if "," in image_url:
        image_url = image_url.split(",", 1)[1]
    image_bytes = base64.b64decode(image_url)
    return Image.open(io.BytesIO(image_bytes)).convert("RGB")

def image_to_data_url(image, fmt: str = "PNG") -> str:
    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/{fmt.lower()};base64,{encoded}"

def build_pseudo_depth(image):
    from PIL import Image, ImageFilter, ImageOps
    # 纯后端算法兜底：把亮度与边缘信息融合成“伪深度图”，保证接口稳定可用
    gray = ImageOps.grayscale(image)
    edge = gray.filter(ImageFilter.FIND_EDGES)
    edge = ImageOps.autocontrast(edge)
    depth = ImageOps.autocontrast(ImageOps.invert(gray))
    # 70%亮度深度 + 30%边缘，增强立体位移观感
    blended = Image.blend(depth.convert("L"), edge.convert("L"), 0.30)
    return blended

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
if not api_key:
    raise RuntimeError(
        "Missing required environment variable: SILICONFLOW_API_KEY. "
        "Please configure it in your runtime environment or Kubernetes Secret."
    )

client = OpenAI(
    api_key=api_key, 
    base_url="https://api.siliconflow.cn/v1",
    timeout=TEXT_MODEL_TIMEOUT
)

# 定义接收的数据结构
class UserMessage(BaseModel):
    # history: 当前轮之前的对话链（不含本轮 user）；text_for_model: 若为 None 则等价于 text
    text: str
    session_id: Optional[str] = None
    history: Optional[List[Dict[str, Any]]] = None
    text_for_model: Optional[str] = None
    image_url: Optional[str] = None


def _user_plain_for_storage(text: str, image_url: Optional[str]) -> str:
    t = (text or "").strip()
    if image_url:
        return f"{t} [附图]" if t else "[附图]"
    return t

class SummaryRequest(BaseModel):
    chat_history: str

class DepthRequest(BaseModel):
    image_url: str

@app.get("/")
def root():
    return {"status": "ok", "service": "TreeHole AI API"}

@app.get("/health")
def health():
    return {
        "status": "ok",
        "has_siliconflow_api_key": bool(api_key),
        "depth_model_loaded": depth_estimator is not None,
        "depth_runtime_error": depth_runtime_error,
    }

@app.post("/chat")
def chat_with_ai(message: UserMessage):
    print("\n--- 收到新消息 ---")
    user_visible = message.text.strip() if message.text else ""
    model_text = (message.text_for_model or "").strip() or user_visible

    history = message.history
    sess = message.session_id

    print(f"session={sess!s} hist turns={len(history) if history else 0} visible_len={len(user_visible)}")

    if message.image_url:
        print("Image detected, using vision model path...")
        user_content: Any = [
            {"type": "text", "text": model_text},
            {"type": "image_url", "image_url": {"url": message.image_url}},
        ]
        target_model = "Qwen/Qwen3.5-9B"
    else:
        print("Text-only message, using text model path...")
        user_content = model_text
        target_model = "deepseek-ai/DeepSeek-V3"

    messages_payload = build_messages_with_memory(sess, history, user_content)
    persist_user = _user_plain_for_storage(user_visible, message.image_url)

    def generator():
        response = None
        chunks: List[str] = []
        try:
            response = client.chat.completions.create(
                model=target_model,
                messages=messages_payload,
                stream=True,
                timeout=IMAGE_MODEL_TIMEOUT if message.image_url else TEXT_MODEL_TIMEOUT,
            )

            for chunk in response:
                if not chunk.choices:
                    continue
                chunk_text = chunk.choices[0].delta.content
                if not chunk_text:
                    continue
                chunks.append(chunk_text)
                yield f"data: {chunk_text}\n\n"

            yield "data: [DONE]\n\n"
            _persist_turn(sess, persist_user, "".join(chunks))
        except GeneratorExit:
            print("Client disconnected, stop streaming.")
        except Exception as e:
            print(f"/chat streaming failed: {e}")
            yield f"data: [ERROR] {e}\n\n"
            yield "data: [DONE]\n\n"
        finally:
            if response and hasattr(response, "close"):
                response.close()

    return StreamingResponse(generator(), media_type="text/event-stream")

@app.post("/summary")
def generate_summary(request: SummaryRequest):
    try:
        response = client.chat.completions.create(
            model="deepseek-ai/DeepSeek-V3", 
            messages=[
                # 👇 替换掉原来的系统提示词
                {"role": "system", "content": "你是一个神奇的情绪魔法师。请阅读用户的聊天记录，提取2-3个【魔法情绪标签】。最后用一句像童话般温柔的话（15字以内）来总结用户今天的心情。\n\n【核心要求】：你必须在回复的最开头，根据用户整体心境，严格输出以下三个主题暗号之一（必须带中括号）：\n[theme-gloomy] （代表难过、压力、疲惫、乌云）\n[theme-sunny] （代表开心、治愈、期待、阳光）\n[theme-default] （代表平稳、日常）\n\n格式示例：\n[theme-sunny]\n标签：✨星星闪烁，🌻向日葵\n总结：今天心里开出了一朵小花呢！"},
                {"role": "user", "content": request.chat_history}
            ],
            timeout=TEXT_MODEL_TIMEOUT
        )
        return {"summary": response.choices[0].message.content}
    except Exception as e:
        return {"summary": f"生成报告失败，错误：{e}"}

@app.post("/generate_depth")
def generate_depth(request: DepthRequest):
    try:
        image = decode_data_url(request.image_url)
        image.thumbnail((768, 768))

        try:
            predictions = get_depth_estimator()(image)
            depth_image = predictions["depth"]
        except Exception as model_error:
            print(f"Depth model unavailable, fallback to pseudo-depth: {model_error}")
            depth_image = build_pseudo_depth(image)

        return {"depth_map": image_to_data_url(depth_image)}
    except Exception as e:
        print(f"Depth map generation failed: {e}")
        return {"error": f"深度图生成失败：{e}"}