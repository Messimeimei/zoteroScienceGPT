
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
      icon: `chrome://${addon.data.config.addonRef}/content/icons/logo.png`,
    },
    onRender: ({ body }) => {
      const existingChat = body.querySelector('#zotero-chat-container');
      if (existingChat) {
        body.removeChild(existingChat);
      }

      const section = body.closest('[data-l10n-id="zotero-view-item"]') as HTMLElement;
      if (section) {
        section.style.cssText = "width: 100%; --open-height: auto; margin: 0; padding: 0;";
      }

      (body as HTMLElement).style.cssText =
        "width: 100%; height: 100%; display: flex; flex-direction: column; margin: 0; padding: 0;";
        const chatContainer = Zotero.getMainWindow().document.createElement('div');
        chatContainer.id = "zotero-chat-container";
        chatContainer.style.cssText =
          "min-height: 600px; padding: 10px; flex: 1; background-color:rgb(255, 255, 255) ; width: \
          100%; height: 90%; display: flex; flex-direction: column; overflow-y: auto; user-select: text; position: relative;";

        let textInput = body.querySelector('#zotero-chat-textinput') as HTMLTextAreaElement;
        if (!textInput) {
          textInput = Zotero.getMainWindow().document.createElement('textarea');
          textInput.id = "zotero-chat-textinput";
          textInput.style.cssText = `
            position: relative;
            font-family: Arial, sans-serif;
            font-size: 12px;
            color:rgb(0, 0, 0);
            width: 100%;
            height: 10%;
            resize: none;
            border-top: 1.5px solid rgb(230, 230, 230);
            border-left: none;
            border-right: none;
            padding: 5px 40px 5px 10px;
            background-color: #f3f4f6;
            user-select: text;
            display: flex;
            justify-content: center;
            align-items: center;
            flex-direction: column;
            overflow-y: auto;
            max-height: 30px;
            outline: none;
          `;
        }

        textInput.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
          }
        });

        let itemData: any = null;
        let allItemData: any = null;
        ZoteroFileHandler.getItemDataCallback = (itemDataReceived) => {
          itemData = itemDataReceived;
        };
        ZoteroFileHandler.getAllItemDataCallback = (allItemDataReceived) => {
          allItemData = allItemDataReceived;
        };

        const sendMessage = async () => {
          const message = textInput.value.trim();
          if (message !== '') {
            const messageDiv = Zotero.getMainWindow().document.createElement('div');
            messageDiv.textContent = message;
            textInput.value = '';
            messageDiv.style.cssText =
              "font-family: Arial, sans-serif; font-size: 12px; color:rgb(0, 0, 0); \
              padding: 10px; margin-bottom: 10px; background-color: #eff6ff; border-radius: 4px; user-select: text;";
            chatContainer.appendChild(messageDiv);
            const responseDiv = Zotero.getMainWindow().document.createElement('div');
            responseDiv.style.cssText = `
              padding: 10px;
              margin-bottom: 10px;
              border-radius: 4px;
              white-space: pre-wrap;
              word-wrap: break-word;
              overflow-wrap: anywhere;
              font-family: Arial, sans-serif; 
              font-size: 12px; 
              color:rgb(0, 0, 0);
              user-select: text;
              justify-content: center;
                `;
            responseDiv.innerHTML = '等待回答中^_^...';
            chatContainer.appendChild(responseDiv);
            try {
          ztoolkit.log("已经发送用户输入内容：", message);
              textInput.value = '';
          const result = await sendMessageToWholeAspectUnderstandingAPI(message, itemData, allItemData);
          if (result && result.decoder) {
            const { response, decoder } = result;
            const responseText = extractStreamData(response);
            if (responseText === 'True') {
              ztoolkit.log("需要额外信息，重新发送数据");
              textInput.value = '';
              const newResult = await sendMessageToWholeAspectUnderstandingAPI(message, itemData, allItemData);
              if (newResult && newResult.decoder) {
                textInput.value = '';
            const { response: newResponse, decoder: newDecoder } = newResult;
            const newResponseText = await extractStreamData(newResponse);
            ztoolkit.log("已发送数据，查看responseText", newResponseText);
                displayReceivedMessage(newResponse, newDecoder, chatContainer, responseDiv);
              } else {
            ztoolkit.log('Error: No response or decoder.');
              }
            } else {
              ztoolkit.log("不需要额外信息，没有重新发送数据");
              displayReceivedMessage(response, decoder, chatContainer, responseDiv);
            }
          } else {
            ztoolkit.log('Error: No response or decoder.');
          }
            } catch (error) {
          ztoolkit.log('Error in sendMessage:', error);
            }

            textInput.value = '';
          }
        };


        body.appendChild(chatContainer);
        body.appendChild(textInput);
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
