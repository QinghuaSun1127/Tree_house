import cv2
import numpy as np
from transformers import pipeline
from PIL import Image

print("⏳ 正在加载 MiDaS 深度估计模型（首次运行会自动下载模型权重，大概几百MB，请耐心等待）...")

# 1. 初始化深度估计管道 (使用轻量级版本，保证普通电脑也能秒出结果)
depth_estimator = pipeline(task="depth-estimation", model="Intel/dpt-hybrid-midas")

# 2. 找一张测试图片（请确保你项目文件夹里有一张名为 test.jpg 的图片！）
image_path = "test.jpg"
try:
    original_image = Image.open(image_path)
    print(f"✅ 成功读取图片：{image_path}，开始计算深度图...")
except FileNotFoundError:
    print(f"❌ 找不到图片！请在同目录下放一张名为 {image_path} 的图片。")
    exit()

# 3. 让模型施展魔法，预测深度
predictions = depth_estimator(original_image)
depth_image = predictions["depth"]  # 这是一张灰度图的 PIL Image 对象

# 4. 将深度图保存下来看看效果
output_path = "depth_output.jpg"
depth_image.save(output_path)

print(f"🎉 深度图计算完成！已保存为 {output_path}。")