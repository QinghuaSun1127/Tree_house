from openai import OpenAI

client = OpenAI(
    api_key="sk-fetpzgjxohmtqihfscdmwhzdwejkjejngtorrjrfucwdufap", 
    base_url="https://api.siliconflow.cn/v1"
)

print("正在直连硅基流动底层服务器，为您查询当前存活的轻量级视觉模型...\n")
try:
    models = client.models.list()
    found = False
    for m in models.data:
        name = m.id.lower()
        # 精准筛选：必须是视觉模型(vl/intern)，且必须是轻量级(7b/8b/small)
        if ("vl" in name or "intern" in name) and ("7b" in name or "8b" in name or "small" in name):
            print(f"👉 存活的模型，请复制这个名字: {m.id}")
            found = True
            
    if not found:
        print("⚠️ 平台目前没有匹配的轻量视觉模型，请检查官方公告。")
except Exception as e:
    print(f"查询失败，错误: {e}")