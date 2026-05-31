# 小圆 AI 陪伴机器人

这是一个适合小学 AI 项目大赛演示的网页对话界面：小朋友可以按住麦克风说话，网页把语音转成文字，后端调用 MiniMax 大脑生成回复，再把回复合成为语音播放，并把名字、喜好、分享的事情保存为本地记忆。

## 功能

- 语音转文字：使用浏览器 Web Speech API，参考 MDN 在 GitHub 上的 Web Speech 示例，不需要额外语音识别 key。
- AI 大脑：通过 MiniMax 中国站 OpenAI 兼容接口 `https://api.minimaxi.com/v1/chat/completions`。
- 文字转语音：通过 MiniMax 同步语音合成接口 `https://api.minimaxi.com/v1/t2a_v2`。
- 真人感声音：默认使用 `speech-2.8-hd` 和 `Chinese (Mandarin)_Warm_Girl`，语速偏快，并在合成文本里加入轻微停顿；如果 MiniMax 语音额度不足，会自动切换到浏览器里更自然的中文声音。
- 记忆：自动记住“我叫……”“我喜欢……”“请记住……”等信息，保存在 `data/memory.json`。
- Transaction 对话记录：每次对话会保存在 `data/transactions.json`，可以在网页左侧看到列表、打开继续对话，也可以删除某个历史 transaction。
- 桂韵创想家：通过阿里云百炼高质量模型生成广西非遗文旅绘本。默认文本模型为 `qwen3.7-max`，图片模型为 `wan2.7-image-pro`，生成作品时会并行生成 4 页连贯插图。
- 安全：API key 只放在后端环境变量中，前端不会暴露 key。

## 运行

1. 安装依赖：

```bash
npm install
```

2. 新建 `.env`，参考 `.env.example` 填入 MiniMax key：

```bash
MINIMAX_API_KEY=你的_minimax_key
MINIMAX_BASE_URL=https://api.minimaxi.com/v1
MINIMAX_MODEL=MiniMax-M2.7
MINIMAX_TTS_MODEL=speech-2.8-hd
MINIMAX_TTS_VOICE="Chinese (Mandarin)_Warm_Girl"
PORT=8787
DASHSCOPE_API_KEY=你的_阿里云百炼_key
BAILIAN_TEXT_MODEL=qwen3.7-max
BAILIAN_IMAGE_MODEL=wan2.7-image-pro
BAILIAN_IMAGE_SIZE=1K
GENERATED_IMAGE_MAX_BYTES=2097152
GENERATED_IMAGE_MAX_SIDE=1024
GENERATED_IMAGE_JPEG_QUALITY=86
```

3. 启动：

```bash
npm run dev
```

打开 `http://127.0.0.1:5173`。

## 比赛演示建议

- 先说：“我叫圆圆，我喜欢画画。”
- 再问：“你还记得我叫什么吗？”
- 继续说：“请记住我今天参加小学 AI 项目大赛。”
- 刷新页面后再问：“你记得我今天做了什么吗？”

## 资料来源

- MiniMax 文本对话 OpenAI 兼容文档：https://platform.minimaxi.com/docs/api-reference/text-chat-openai
- MiniMax 同步语音合成文档：https://platform.minimaxi.com/docs/api-reference/speech-t2a-http
- GitHub Web Speech 示例：https://github.com/mdn/dom-examples/tree/main/web-speech-api
