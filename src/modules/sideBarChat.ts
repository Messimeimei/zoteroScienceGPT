
import { config } from "../../package.json";
import { getLocaleID, getString } from "../utils/locale";
import { ZoteroFileHandler } from "./fileOperations";
import axios, { AxiosResponse } from 'axios';
import { marked } from 'marked';


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
        "width: 100%; height: 100%; display: flex; flex-direction: column; background-color: white; overflow: hidden; userSelect:text;";

      const chatContent = Zotero.getMainWindow().document.createElement('div');
      chatContent.id = "chat-content";
      chatContent.style.cssText =
        "flex: 1; overflow-y: auto; padding: 10px; background-color: white; min-height: 600px; userSelect:text;";

      const inputArea = Zotero.getMainWindow().document.createElement('div');
      inputArea.style.cssText =
        "background-color: #f9f9f9; flex-shrink: 0; display: flex; align-items: center; userSelect:text;";

      const inputWrapper = Zotero.getMainWindow().document.createElement('div');
      inputWrapper.style.cssText = "position: relative; flex: 1; height: 60px; userSelect:text;";

      const textInput = Zotero.getMainWindow().document.createElement('textarea');
      textInput.style.cssText =
        "width: 100%; height: 100%; resize: none; border: 1px solid #ccc; border-radius: 4px; padding: 5px 40px 5px 10px; background-color: #ccc; userSelect:text;";

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

      let itemData: any = null;
      let allItemData: any = null;
      ZoteroFileHandler.getItemDataCallback = (itemDataReceived) => {
        itemData = itemDataReceived; // 存储从 Zotero 获取的数据
      };
      ZoteroFileHandler.getAllItemDataCallback = (allItemDataReceived) => {
        allItemData = allItemDataReceived;
      }

      // 主函数：整合发送和展示逻辑
      const sendMessage = async () => {
        const message = textInput.value.trim();
        if (message !== '') {
          // 展示用户发送的消息
          const messageDiv = Zotero.getMainWindow().document.createElement('div');
          messageDiv.textContent = message;
          textInput.innerHTML = '';
          messageDiv.style.cssText =
            "padding: 10px; margin-bottom: 10px; background-color: #e6e6e6; border-radius: 4px; userSelect:text;";
          chatContent.appendChild(messageDiv);
          chatContent.scrollTop = chatContent.scrollHeight;

          // 准备接收消息的展示容器
          const responseDiv = Zotero.getMainWindow().document.createElement('div');
          responseDiv.style.cssText = `
            padding: 10px;
            margin-bottom: 10px;
            background-color: #d4edda;
            border-radius: 4px;
            white-space: pre-wrap;
            word-wrap: break-word;
            max-width: 90%;
            overflow-wrap: anywhere;
            userSelect:text;
        `;
          chatContent.appendChild(responseDiv);

          // 获取完整数据并判断是否为 'True'
          try {
            ztoolkit.log("已经发送用户输入内容：", message)
            const result = await sendMessageToClassficationAPI(message, true, itemData, allItemData);
            // 第一次发送数据得到回复
            if (result && result.decoder) {
              const { response, decoder } = result;
              const responseText = extractStreamData(response);
              // 返回True
              if (responseText === 'True') {
                ztoolkit.log("需要额外信息，重新发送数据");
                // 发送带有额外信息的数据
                const newResult = await sendMessageToClassficationAPI(message, true, itemData, allItemData);
                // 第二次发送数据得到回复
                if (newResult && newResult.decoder) {
                  const { response: newResponse, decoder: newDecoder } = result;
                  const newResponseText = await extractStreamData(newResponse);
                  ztoolkit.log("已发送数据，查看responseText", newResponseText);
                  displayReceivedMessage(newResponse, newDecoder, chatContent, responseDiv);
                } else { // 第二次发送数据没有回复
                  ztoolkit.log('Error: No response or decoder.');
                }

              } else { // 返回不为True
                ztoolkit.log("不需要额外信息，没有重新发送数据");
                // 正常展示接收到的消息
                displayReceivedMessage(response, decoder, chatContent, responseDiv);
              }

            } else { // 第一次发送数据没有回复
              ztoolkit.log('Error: No response or decoder.');
            }
          } catch (error) {
            ztoolkit.log('Error in sendMessage:', error);
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


export function extractStreamData(reader: any) {
  const data = reader.data;
  ztoolkit.log("待提取：", data);

  // 按 \n\n 分割数据
  const messageParts = data.split('\n\n');
  ztoolkit.log("分割后的数据：", messageParts);

  let fullAnswer = '';

  // 使用正则表达式提取 event 和 answer 字段
  const eventRegex = /"event":\s?"(.*?)"/g;
  const answerRegex = /"answer":\s?"(.*?)"/g;

  messageParts.forEach((part: any) => {
    ztoolkit.log("去除 'data:' 部分完成")
    if (part.startsWith("data:")) {
      part = part.substring(5).trim();  // 去掉前面的 'data:' 和空格
    } else { // 不是data开头直接结束
      return;
    }

    ztoolkit.log("去掉data后结果：",messageParts)

    // 尝试解析为 JSON
    try {
      const jsonData = JSON.parse(part);
      if (jsonData.event) {
        const event = jsonData.event;

        // 如果 event 是 'message_end'，则停止拼接，跳出当前循环
        if (event === 'message_end') {
          ztoolkit.log("检测到 message_end，停止拼接");
          return; 
        }

        // 如果 event 是 'agent_message'，则拼接 answer
        if ((event === 'agent_message' || event === 'message') && jsonData.answer) {
          const answer = jsonData.answer;
          ztoolkit.log("每一个answer:", answer);
          fullAnswer += answer;
        }
      }
    } catch (error) {
      ztoolkit.log("JSON 解析错误:", error);
    }
  });

  ztoolkit.log("最后结果：", fullAnswer);
  return fullAnswer.trim(); // 返回拼接后的答案
}


export function displayReceivedMessage(reader: any, decoder: any, chatContent: any, responseDiv: any) {
  const decodedAnswer = extractStreamData(reader);
  let responseText = '';

  let currentIndex = 0;
  const interval = setInterval(() => {
    if (currentIndex < decodedAnswer.length) {
      responseText += decodedAnswer[currentIndex];

      // 渲染 Markdown 内容到 HTML
      responseDiv.innerHTML = marked.parse(responseText);

      // 自动滚动到最新消息
      chatContent.scrollTop = chatContent.scrollHeight;

      currentIndex++;
    } else {
      clearInterval(interval);
    }
  }, 40);

  return decodedAnswer;
}


export interface SendMessageResponse {
  response: AxiosResponse<any>;
  decoder: TextDecoder;
}

// 文献分类API
export async function sendMessageToClassficationAPI(message: any, needExtraInfo: boolean, ItemData: any, allItemData: any): Promise<SendMessageResponse | undefined> {

  ztoolkit.log("查看是否要额外信息：", needExtraInfo)
  ztoolkit.log("查看额外信息：", ItemData)
  // 如果 needExtraInfo 为 true 且 extraInfo 不为空，则拼接 message 和 extraInfo
  if (needExtraInfo) {
    if (typeof ItemData === 'object') {
      ItemData = JSON.stringify(ItemData);
    }
    if (typeof allItemData === 'object') {
      allItemData = JSON.stringify(allItemData);
    }
    ztoolkit.log('查看if后的2个数据', ItemData, allItemData)
    // 拼接 用户输入和相关元数据
    message = `
               ${message}\n
               ${allItemData}`;
  }
  ztoolkit.log("查看最后的message：", message)

  const data = {
    "inputs": {},
    "query": message,
    "response_mode": 'streaming',
    "conversation_id": '',
    "user": "杨鑫"
  };
  try {
    const response = await axios.post('https://api.dify.ai/v1/chat-messages', data, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const decoder = new TextDecoder('utf-8');

    return { response, decoder }
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      ztoolkit.log('Axios 错误:', error.response?.data || error.message);
      ztoolkit.log('响应状态码:', error.response?.status);
      ztoolkit.log('请求配置:', error.config);
    } else {
      ztoolkit.log('未知错误:', error);
    }
    return undefined
  }
}

// 文献摘要API
export async function sendMessageToAbstractionAPI(message: any, metaData: any): Promise<SendMessageResponse | undefined> {
  // 基于多篇文献元数据对文献进行主题摘要，并返回内容
    if (typeof metaData === 'object') {
      metaData = JSON.stringify(metaData);
    }

    ztoolkit.log('查看多个文献元数据：', metaData)
    // 拼接 用户输入和相关元数据
    message = `
               ${message}\n
               ${metaData}`;

  ztoolkit.log("查看最后的message：", message)

  const data = {
    "inputs": {},
    "query": message,
    "response_mode": 'streaming',
    "conversation_id": '',
    "user": "杨鑫"
  };
  try {
    const response = await axios.post('https://api.dify.ai/v1/chat-messages', data, {
      headers: {
        'Authorization': `Bearer ${config.abstractionApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const decoder = new TextDecoder('utf-8');

    return { response, decoder }
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      ztoolkit.log('Axios 错误:', error.response?.data || error.message);
      ztoolkit.log('响应状态码:', error.response?.status);
      ztoolkit.log('请求配置:', error.config);
    } else {
      ztoolkit.log('未知错误:', error);
    }
    return undefined
  }
}


// 单篇文献理解API
export async function sendMessageToSingleConversationAPI(message:any, selectedText: any, wholeText: any): Promise<SendMessageResponse | undefined> {
  // 基于多篇文献元数据对文献进行主题摘要，并返回内容
    ztoolkit.log('查看用户提问：', message)
    ztoolkit.log('查看选中内容：', selectedText)
    ztoolkit.log('查看pdf全文：', wholeText)
    // 拼接 用户输入和相关元数据
    wholeText = `用户提问：${message}\n
               选中内容：${selectedText}\n
               PDF全文（上下文背景）：${wholeText}`;

  ztoolkit.log("查看最后的message：", wholeText)

  const data = {
    "inputs": {},
    "query": wholeText,
    "response_mode": 'streaming',
    "conversation_id": '',
    "user": "杨鑫"
  };
  try {
    const response = await axios.post('https://api.dify.ai/v1/chat-messages', data, {
      headers: {
        'Authorization': `Bearer ${config.singleConversationKey}`,
        'Content-Type': 'application/json'
      }
    });

    const decoder = new TextDecoder('utf-8');

    return { response, decoder }
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      ztoolkit.log('Axios 错误:', error.response?.data || error.message);
      ztoolkit.log('响应状态码:', error.response?.status);
      ztoolkit.log('请求配置:', error.config);
    } else {
      ztoolkit.log('未知错误:', error);
    }
    return undefined
  }
}

