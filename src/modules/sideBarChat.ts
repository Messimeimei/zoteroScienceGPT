
import { it } from "node:test";
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
        "width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden; userSelect:text;";

      const chatContent = Zotero.getMainWindow().document.createElement('div');
      chatContent.id = "chat-content";
      chatContent.style.cssText =
        "flex: 1; overflow-y: auto; padding: 10px; background-color: #232627; min-height: 600px; userSelect:text;";

      const inputArea = Zotero.getMainWindow().document.createElement('div');
      inputArea.style.cssText =
        "background-color: #232627; flex-shrink: 0; display: flex; align-items: center; justify-content: center; userSelect:text; position: relative; height: 10%; bottom: 5%";

      const inputWrapper = Zotero.getMainWindow().document.createElement('div');
      inputWrapper.style.cssText = `
        position: absolute;
        bottom: 80%;
        left: 2%;
        right: 2%;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 96%; /* 100% - 5% left - 5% right */
        height: 30px;
      `;

      const textInput = Zotero.getMainWindow().document.createElement('textarea');
      textInput.style.cssText = `
        font-family: Arial, sans-serif;
        font-size: 12px;
        color: #ffffff;
        width: 80%;
        height: 100%;
        resize: none;
        border: 3px solid rgb(65, 67, 68);
        border-radius: 4px;
        padding: 5px 40px 5px 10px;
        background-color: #232627;
        user-select: text;
        display: flex;
        justify-content: center;
        align-items: center;
        margin: 10px;
      `;
      const sendButton = Zotero.getMainWindow().document.createElement('div');
      sendButton.innerHTML = '&#x27A4;';
      sendButton.style.cssText = `
        position: absolute;
        top: 50%;
        right: 6%;
        transform: translateY(-50%);
        width: 30px; // 调整宽度以适应图标
        height: 30px; // 调整高度以适应图标
        border: none;
        border-radius: 50%;
        cursor: pointer;
        font-size: 20px; // 调整字体大小以适应图标
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: transparent; // 确保背景透明
        color: #808080; // 设置图标颜色为灰色
        user-select: none; // 防止用户选择文本
      `;

      // 添加点击事件
      sendButton.addEventListener('click', () => {
        sendMessage(); // 调用发送消息的函数
      });

      const updateButtonState = () => {
        if (textInput.value.trim() === '') {
          sendButton.style.cursor = 'not-allowed';
        } else {
          sendButton.style.cursor = 'pointer';
        }
      };

      textInput.addEventListener('input', updateButtonState);

      let itemData: any = null;
      let allItemData: any = null;
      ZoteroFileHandler.getItemDataCallback = (itemDataReceived) => {
        itemData = itemDataReceived; // 存储从 Zotero 获取的数据
      };
      ztoolkit.log('对话应用查看回调：', itemData);
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
            "font-family: Arial, sans-serif; font-size: 12px; color: #ffffff; padding: 10px; margin-bottom: 10px; background-color: #2b2f30; border-radius: 4px; user-select: text;";
          chatContent.appendChild(messageDiv);
          chatContent.scrollTop = chatContent.scrollHeight;

          // 准备接收消息的展示容器
          const responseDiv = Zotero.getMainWindow().document.createElement('div');
          responseDiv.style.cssText = `
            padding: 10px;
            margin-bottom: 10px;
            background-color: #141718;
            border-radius: 4px;
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-wrap: anywhere;
            font-family: Arial, sans-serif; font-size: 12px; color: #ffffff;
            user-select:text;
        `;
          responseDiv.innerHTML = '等待回答中^_^...';
          chatContent.appendChild(responseDiv);

          // 获取完整数据并判断是否为 'True'
          try {
            ztoolkit.log("已经发送用户输入内容：", message)
            const result = await sendMessageToWholeAspectUnderstandingAPI(message, itemData, allItemData);
            // 第一次发送数据得到回复
            if (result && result.decoder) {
              const { response, decoder } = result;
              const responseText = extractStreamData(response);
              // 返回True
              if (responseText === 'True') {
                ztoolkit.log("需要额外信息，重新发送数据");
                // 发送带有额外信息的数据
                const newResult = await sendMessageToWholeAspectUnderstandingAPI(message, itemData, allItemData);
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

    ztoolkit.log("去掉data后结果：", messageParts)

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
export async function sendMessageToSingleConversationAPI(message: any, selectedText: any, wholeText: any): Promise<SendMessageResponse | undefined> {
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

// 整体文献摘要API
export async function sendMessageToWholeAspectUnderstandingAPI(message: any, metaData: any, allMetaData: any): Promise<SendMessageResponse | undefined> {
  // 对选中的单篇文献或整体文件夹的文献进行提问
  if (typeof metaData === 'object') {
    metaData = JSON.stringify(metaData);
  }

  if (typeof allMetaData === 'object') {
    allMetaData = JSON.stringify(allMetaData);
  }

  ztoolkit.log('查看多个文献元数据：', allMetaData)
  // 拼接用户输入和相关元数据
  message = `
               ${message}\n
               当前选中文献元数据:${metaData}\n
               当前选中文件夹所有文献元数据:${allMetaData}\n`;

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
        'Authorization': `Bearer ${config.wholeAspectUnderstandingKey}`,
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

// 文献笔记生成API
export async function sendMessageToNoterAPI(message: any, metaData: any, wholeText: any): Promise<SendMessageResponse | undefined> {
  // 为单篇文献生成阅读笔记
  if (typeof metaData === 'object') {
    metaData = JSON.stringify(metaData);
  }

  ztoolkit.log('查看单篇文献元数据：', metaData)
  message = `
               ${message}\n
              文献元数据是： ${metaData}
              文献全文是： ${wholeText}`;

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
        'Authorization': `Bearer ${config.noteKey}`,
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
