from openai import OpenAI

# 1. 初始化客户端：把刚才保存的秘钥填在引号里
# 请将 'sk-这里填入你刚才复制的APIKey' 替换为你真实的 Key
client = OpenAI(
    api_key="sk-fetpzgjxohmtqihfscdmwhzdwejkjejngtorrjrfucwdufap", 
    base_url="https://api.siliconflow.cn/v1"
)

print("正在呼叫 AI 树洞...")

# 2. 向 AI 发送一条消息
response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[
        # System 角色：设定 AI 的身份和性格（这就是你的产品核心）
        {"role": "system", "content": "你是一个温暖的心理学树洞伴侣。请用简短、温柔的语气回复用户。"},
        # User 角色：这是你（用户）说的话
        {"role": "user", "content": "我今天在学校做项目遇到了很多困难，感觉有点沮丧。"}
    ]
)

# 3. 打印出 AI 的回答
print("\n树洞的回复：")
print(response.choices[0].message.content)