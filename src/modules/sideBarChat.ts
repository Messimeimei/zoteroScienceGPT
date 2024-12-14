import { config } from "../../package.json"; 
import { getLocaleID, getString } from "../utils/locale";

export function registerSidebarIcon() {
  // 注册侧边栏部分
  Zotero.ItemPaneManager.registerSection({
    paneID: "chatSection",
    pluginID: addon.data.config.addonID,
    header: {
      l10nID: getLocaleID("sidenav-chat-section-head-text"),
      icon: "chrome://zotero/skin/16/universal/book.svg",
    },
    sidenav: {
      l10nID: getLocaleID("sidenav-chat-section-tooltip"),
      icon: `chrome://${addon.data.config.addonRef}/content/icons/chat.png`,
    },
    onRender: ({ body }) => {
      const existingChat = body.querySelector('#zotero-chat-container');
      if (existingChat) {
        body.removeChild(existingChat);
      }

      const section = body.closest('[data-l10n-id="zotero-view-item"]') as HTMLElement;
      if (section) {
        section.style.cssText = "width: 100%; --open-height: auto;";
      }

      (body as HTMLElement).style.cssText = 
        "width: 100%; height: 100%; display: flex; flex-direction: column;";

      const chatContainer = Zotero.getMainWindow().document.createElement('div');
      chatContainer.id = "zotero-chat-container";
      chatContainer.style.cssText = 
        "width: 100%; height: 100%; display: flex; flex-direction: column; background-color: white; overflow: hidden;";

      const chatContent = Zotero.getMainWindow().document.createElement('div');
      chatContent.id = "chat-content";
      chatContent.style.cssText = 
        "flex: 1; overflow-y: auto; padding: 10px; background-color: white; min-height: 600px;";

      const inputArea = Zotero.getMainWindow().document.createElement('div');
      inputArea.style.cssText = 
        "background-color: #f9f9f9; flex-shrink: 0; display: flex; align-items: center;";

      const inputWrapper = Zotero.getMainWindow().document.createElement('div');
      inputWrapper.style.cssText = "position: relative; flex: 1; height: 60px;";

      const textInput = Zotero.getMainWindow().document.createElement('textarea');
      textInput.style.cssText = 
        "width: 100%; height: 100%; resize: none; border: 1px solid #ccc; border-radius: 4px; padding: 5px 40px 5px 10px; background-color: #ccc;";

      const sendButton = Zotero.getMainWindow().document.createElement('button');
      sendButton.innerHTML = '▲';
      sendButton.style.cssText = 
        "position: absolute; top: 65%; right: 10px; transform: translateY(-50%); width: 30px; height: 30px; background-color: #ccc; border: none; border-radius: 50%; cursor: not-allowed; font-size: 12px; display: flex; align-items: center; justify-content: center;";

      const updateButtonState = () => {
        if (textInput.value.trim() === '') {
          sendButton.style.backgroundColor = '#ccc';
          sendButton.style.cursor = 'not-allowed';
        } else {
          sendButton.style.backgroundColor = '#4CAF50';
          sendButton.style.cursor = 'pointer';
        }
      };

      textInput.addEventListener('input', updateButtonState);
      

      const sendMessage = async () => {
        const message = textInput.value.trim();
        if (message !== '') {
          const messageDiv = Zotero.getMainWindow().document.createElement('div');
          messageDiv.textContent = message;
          // 发送完消息后清空聊天框
          textInput.innerHTML = '';
          messageDiv.style.cssText = "padding: 10px; margin-bottom: 10px; background-color: #e6e6e6; border-radius: 4px;";
          chatContent.appendChild(messageDiv);
          chatContent.scrollTop = chatContent.scrollHeight;

          try {
            const response = await fetch('https://api.dify.ai/v1/chat-messages', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                inputs: {},
                query: message,
                response_mode: 'streaming',
                conversation_id: '',
                user: 'abc-123',
              }),
            });

            const reader = response.body?.getReader();
            ztoolkit.log("打印reader:", reader);

            const decoder = new TextDecoder('utf-8');
            let done = false;

            // Create a single response div for streaming updates
            const responseDiv = Zotero.getMainWindow().document.createElement('div');
            responseDiv.style.cssText = `
            padding: 10px; 
            margin-bottom: 10px; 
            background-color: #d4edda; 
            border-radius: 4px; 
            white-space: pre-wrap; 
            word-wrap: break-word; /* 自动换行 */
            max-width: 90%; /* 设置最大宽度为容器宽度的90% */
            overflow-wrap: anywhere; /* 防止长单词溢出 */
          `;
          chatContent.appendChild(responseDiv);
          chatContent.style.cssText = `
          flex: 1; 
          overflow-y: auto; 
          padding: 10px; 
          background-color: white; 
          min-height: 600px; 
          display: flex; 
          flex-direction: column; 
          align-items: flex-start; /* 内容从左对齐 */
        `;

            let responseText = ''; // 完整的响应文本

while (!done) {
  const { value, done: readerDone } = await reader!.read();
  done = readerDone;

  const chunk = decoder.decode(value, { stream: true });
  ztoolkit.log("打印chunk:", chunk);

  // 按换行符分割数据
  const lines = chunk.split('\n').filter((line) => line.trim() !== '');

  for (const line of lines) {
    if (line.includes('answer')) {
      // 找到 'answer' 后的内容，并定位到 }
      const startIndex = line.indexOf('answer') + 9; // 'answer": ' 后的起始位置
      const endIndex = line.indexOf('}', startIndex); // 定位到 '}' 结束位置

      // 提取 answer 部分的字符串（即 Unicode 编码的部分），并去掉前后的双引号
      let answerPart = line.slice(startIndex, endIndex).trim();
      
      // 去掉可能存在的引号（处理答复中的转义字符）
      if (answerPart.startsWith('"') && answerPart.endsWith('"')) {
        answerPart = answerPart.slice(1, -1);
      }

      if (answerPart) {
        try {
          // 解码 Unicode 转义字符
          const decodedAnswer = answerPart.replace(/\\u[\dA-Fa-f]{4}/g, (match) => {
            // 将 \uXXXX 转换为对应字符
            return String.fromCharCode(parseInt(match.slice(2), 16));
          });

          let currentIndex = 0;

          // 按字符逐步显示到展示框
          const interval = setInterval(() => {
            if (currentIndex < decodedAnswer.length) {
              responseText += decodedAnswer[currentIndex]; // 逐个添加字符到文本
              responseDiv.textContent = responseText; // 更新div中的文本
              chatContent.scrollTop = chatContent.scrollHeight; // 滚动到最新内容
              currentIndex++;
            } else {
              clearInterval(interval); // 当全部字符显示完毕时停止
            }
          }, 50); // 每50ms显示一个字符

        } catch (e) {
          ztoolkit.log('Error decoding answer:', e);
        }
      }
    }
  }
}



          } catch (error) {
            ztoolkit.log('Error:', error);
          }

          textInput.value = '';
          updateButtonState();
        }
      };

      sendButton.addEventListener('click', sendMessage);

      textInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          sendMessage();
        }
      });

      inputWrapper.appendChild(textInput);
      inputWrapper.appendChild(sendButton);
      inputArea.appendChild(inputWrapper);
      chatContainer.appendChild(chatContent);
      chatContainer.appendChild(inputArea);
      body.appendChild(chatContainer);
    },
  });
}
