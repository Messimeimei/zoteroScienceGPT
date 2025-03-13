/**
 * 注册 PDF 相关事件监听器的函数
 *
 * 调用后将自动注册以下监听器：
 * - renderTextSelectionPopup：当 PDF 中用户选中文本时触发
 * - renderToolbar：当 PDF 工具栏渲染时触发（用于判断 PDF 是否已打开）
 *
 * 同时，窗口卸载时会自动注销这两个监听器，外部调用时无需额外处理注销。
 */
import { extractStreamData, sendMessageToSingleConversationAPI } from "./sideBarChat";
import { config } from "../../package.json";
import { ZoteroFileHandler } from "./fileOperations";
import { marked } from "marked";
import { UITool } from "zotero-plugin-toolkit/dist/tools/ui";


export async function registerPDFListener(): Promise<void> {
  // 检查 Zotero 主窗口和相关接口是否可用
  if (
    !Zotero.getMainWindow().Zotero ||
    !Zotero.Reader ||
    typeof Zotero.Reader.registerEventListener !== "function"
  ) {
    ztoolkit.log("Zotero.Reader 或 registerEventListener 接口不可用，无法注册 PDF 事件监听器。");
    return;
  }

  const pluginID = config.addonID; // 可从配置中获取实际的插件 ID


  // 定义文本选中弹窗事件处理函数
  const textSelectionHandler: _ZoteroTypes.Reader.EventHandler<"renderTextSelectionPopup"> = async (event) => {
    getFilesNumber(Zotero.DataDirectory.dir + '\\' + 'PdfConversation');
    let result: any;
    let id: any;
    const pdfItemId = event.reader.itemID;
    const selectedText = event.params?.annotation?.text || "";
    
    const dialogData: { [key: string | number]: any } = {
      loadCallback: () => {
        ztoolkit.log("PDF 阅读对话框已打开");
      },
      unloadCallback: () => {
        ztoolkit.log("PDF 阅读对话框已关闭");
      },
      title: "PDF 阅读对话框",
    };

    const dialogHelper = new ztoolkit.Dialog(3, 1); // 改为只有1列


    // 第二段：输入框
    dialogHelper.addCell(0, 0, {
      tag: "textarea",
      properties: {
        value: "请输入问题",
      },
      styles: {
        display: "flex",
        width: "800px",
        height: "80px",
        padding: "8px",
        border: "1px solid #ddd",
        backgroundColor: "#ffffff",
        borderRadius: "4px",
        margin: "0",
        fontSize: "14px",
        whiteSpace: "normal", // 允许文本换行
        resize: "none", // 禁止用户调整大小
        outline: "none", // 移除聚焦时的蓝色边框

      },
      listeners: [
        {
          type: "focus",
          listener: (e: Event) => {
            const input = e.target as HTMLInputElement;
            if (input.value === "请输入问题") {
              input.value = "";
            }
          },
        },
        {
          type: "keypress",
          listener: async (e: Event) => {
            const keyboardEvent = e as KeyboardEvent;
            const input = keyboardEvent.target as HTMLInputElement;
            if (keyboardEvent.key === "Enter" && input.value.trim() !== "" && input.value !== "请输入问题") {
              const question = input.value;
              input.value = "处理中...";
              input.disabled = true;

              try {
                if (pdfItemId) {
                  const pdfText = await ZoteroFileHandler.getPdfInfoById(pdfItemId);
                  if (pdfText) {
                    result = await sendMessageToSingleConversationAPI(
                      question,
                      selectedText,
                      pdfText
                    );

                    if (result && result.decoder) {
                      const { response, decoder } = result;
                      result = extractStreamData(response);

                      const resultDiv = dialogHelper.window?.document.querySelector('[data-content-display]') as HTMLDivElement;
                      const buttonArea = dialogHelper.window?.document.querySelector('[data-button-area]') as HTMLDivElement;
                      if (resultDiv && buttonArea) {
                        resultDiv.style.display = "block";
                        resultDiv.style.height = "450px"
                        buttonArea.style.display = "flex"; // 显示按钮区
                        try {
                          if (ZoteroFileHandler.isMarkdown(result)) {
                            resultDiv.innerHTML = await marked.parse(result);
                          } else {
                            resultDiv.textContent = result;
                          }
                        } catch (error) {
                          resultDiv.innerHTML = "<p style='color: red;'>无法显示内容，请检查 Markdown 格式。</p>";
                          ztoolkit.log("Markdown 转换失败:", error);
                        }

                        // 渲染并展示完结果后，保存对话结果到文件
                        let id = 0; // 默认保存文件序号从 0 开始
                        const numbers = await getFilesNumber(Zotero.DataDirectory.dir + '\\' + 'PdfConversation');  // 获取已有文件序号
                        if (numbers.length > 0) {
                          // 如果有文件序号，则取最大值加 1
                          id = numbers[numbers.length - 1] + 1;
                          await saveConversationResult(id, result);
                        } else {
                          // 否则从 0 开始
                          await saveConversationResult(id, result);
                        }
                        input.style.display = "none";
                      }
                    }

                  }
                }
              } catch (error) {
                const resultDiv = dialogHelper.window?.document.querySelector('[data-content-display]') as HTMLDivElement;
                const buttonArea = dialogHelper.window?.document.querySelector('[data-button-area]') as HTMLDivElement;
                if (resultDiv && buttonArea) {
                  resultDiv.style.display = "block";
                  resultDiv.style.height = '450px'
                  buttonArea.style.display = "flex"; // 显示按钮区
                  resultDiv.textContent = "处理出错：" + (error as Error).message;
                  input.style.display = "none";
                }
              }
            }
          },
        },
      ],
    });

    // 第三段：结果显示区
    dialogHelper.addCell(1, 0, {
      tag: "div",
      attributes: {
        "data-content-display": "", // 添加标识属性
      },
      styles: {
        width: "calc(100% - 20px)", // 减去左右padding
        margin: "10px 0 10px 0", // 使用auto实现水平居中
        padding: "10px",
        overflowY: "auto",
        backgroundColor: "rgb(229, 255, 226)",
        display: "none", // 初始隐藏
      },

    }, true);

    // 第四段：按钮区
    dialogHelper.addCell(2, 0, {
      tag: "div",
      attributes: {
      "data-button-area": "", // 添加标识属性
      },
      styles: {
      display: "block", // 初始隐藏
      justifyContent: "flex-start",  // 改为flex-start
      width: "100%",
      margin: "10px 0",
      gap: "10px",
      padding: "10px 0",
      },
      children: [
      {
        tag: "button",
        attributes:
        {
        "data-previous-conversation": "",
        },
        properties: {
        textContent: "↑ 上一条对话",
        },
        styles: {
        color: "rgb(37, 174, 238)",
        padding: "5px 15px",
        margin: "0 10px",
        minWidth: "100px", // 添加最小宽度使按钮大小一致
        fontSize: "14px",
        fontStyle: "bold",
        borderRadius: "14px",
        border: "1px solid rgb(37, 174, 238)",
        backgroundColor: "rgb(131, 204, 237)",
        cursor: "pointer",
        },
        listeners: [
        {
          type: "click",
          listener: async () => {
          const numbers = await getFilesNumber(Zotero.DataDirectory.dir + '\\' + 'PdfConversation');  // 获取已有文件序号
          const resultDisplay = dialogHelper.window?.document.querySelector('[data-content-display]') as HTMLElement;
          const nextButton = dialogHelper.window?.document.querySelector('[data-next-conversation]') as HTMLButtonElement;
          const previousButton = dialogHelper.window?.document.querySelector('[data-previous-conversation]') as HTMLButtonElement;

          nextButton.disabled = false;
          nextButton.style.backgroundColor = "#f5f5f5";

          if (numbers.length === 0) {
            resultDisplay.textContent = "无历史对话记录";
            previousButton.disabled = true;
            previousButton.style.backgroundColor = "#ccc";
            return;
          }

          if (typeof id === 'undefined') {
            id = numbers.length - 1;
          }

          if (id >= 0) {
            const content = await getFileContent(id);  // 获取文件内容
            if (content) {
            try {
              if (ZoteroFileHandler.isMarkdown(content)) {
              resultDisplay.innerHTML = await marked.parse(content);
              } else {
              resultDisplay.textContent = content;
              }
            } catch (error) {
              resultDisplay.innerHTML = "<p style='color: red;'>无法显示内容，请检查 Markdown 格式。</p>";
              ztoolkit.log("Markdown 转换失败:", error);
            }
            } else {
            resultDisplay.textContent = "读取上轮对话内容失败";
            }
            id--;
            ztoolkit.log(`当前id: ${id}`);
          }
          else {
            resultDisplay.textContent = "无历史对话记录";
            previousButton.disabled = true;
            previousButton.style.backgroundColor = "#ccc";
            id = 0;
          }
          },
        },
        ],
      },
      {
        tag: "button",
        attributes: {
        "data-next-conversation": "",
        },
        properties: {
        textContent: "↓ 下一条对话",
        },
        styles: {
          color: "rgb(225, 81, 33)",
        padding: "5px 15px",
        margin: "0 10px",
        minWidth: "100px", // 添加最小宽度使按钮大小一致
        fontSize: "14px",
        borderRadius: "14px",
          border: "1px solid rgb(225, 81, 33)",
          backgroundColor: "rgb(233, 218, 213)",
        cursor: "pointer",
        },
        listeners: [
        {
          type: "click",
          listener: async () => {
          const numbers = await getFilesNumber(Zotero.DataDirectory.dir + '\\' + 'PdfConversation');  // 获取已有文件序号
          const resultDisplay = dialogHelper.window?.document.querySelector('[data-content-display]') as HTMLElement;
          const nextButton = dialogHelper.window?.document.querySelector('[data-next-conversation]') as HTMLButtonElement;
          const previousButton = dialogHelper.window?.document.querySelector('[data-previous-conversation]') as HTMLButtonElement;

          previousButton.disabled = false;
          previousButton.style.backgroundColor = "#f5f5f5";

          if (numbers.length === 0) {
            resultDisplay.textContent = "无历史对话记录";
            nextButton.disabled = true;
            nextButton.style.backgroundColor = "#ccc";
            return;
          }

          if (typeof id === 'undefined') {
            id = numbers.length - 1;
          }

          if (id <= numbers.length - 1) {
            const content = await getFileContent(id);  // 获取文件内容
            if (content) {
            try {
              if (ZoteroFileHandler.isMarkdown(content)) {
              resultDisplay.innerHTML = await marked.parse(content);
              } else {
              resultDisplay.textContent = content;
              }
            } catch (error) {
              resultDisplay.innerHTML = "<p style='color: red;'>无法显示内容，请检查 Markdown 格式。</p>";
              ztoolkit.log("Markdown 转换失败:", error);
            }
            } else {
            resultDisplay.textContent = "读取下轮对话内容失败";
            }
            id++;

          } else {
            resultDisplay.textContent = "无更多对话记录";
            nextButton.disabled = true;
            nextButton.style.backgroundColor = "#ccc";
            id = numbers.length - 1;
          }
          },
        },
        ],
      },
      {
        tag: "button",
        properties: {
        textContent: "继续对话",
        },
        styles: {
        padding: "5px 15px",
        margin: "0 10px",
        minWidth: "100px", // 添加最小宽度使按钮大小一致
        fontSize: "14px",
        borderRadius: "4px",
        border: "1px solid #ccc",
          backgroundColor: "rgb(225, 81, 33)",
        cursor: "pointer",
        },
        listeners: [
        {
          type: "click",
          listener: () => {
          // 清空当前结果显示区的内容
          const resultDisplay = dialogHelper.window?.document.querySelector('[data-content-display]') as HTMLElement;
          if (resultDisplay) {
            resultDisplay.innerHTML = '';
            resultDisplay.style.display = 'none'; // 隐藏结果显示区
          }

          // 隐藏按钮区
          const buttonArea = dialogHelper.window?.document.querySelector('[data-button-area]') as HTMLElement;
          if (buttonArea) {
            buttonArea.style.display = 'none';
          }

          // 显示输入框
          const input = dialogHelper.window?.document.querySelector('textarea') as HTMLTextAreaElement;
          if (input) {
            input.style.display = 'block';
            input.style.height = "80px"; // 恢复输入框高度
            input.value = "请输入问题";
            input.disabled = false;
          }

          id = undefined;  // 重置 id
          },
        },
        ],
      },
        {
          tag: "button",
          attributes:
          {
            "data-previous-conversation": "",
          },
          properties: {
            textContent: "↑ 上一条对话",
          },
          styles: {
            color: "rgb(37, 174, 238)",
            padding: "5px 15px",
            margin: "0 10px",
            minWidth: "100px", // 添加最小宽度使按钮大小一致
            fontSize: "14px",
            fontStyle: "bold",
            borderRadius: "14px",
            border: "1px solid rgb(37, 174, 238)",
            backgroundColor: "rgb(131, 204, 237)",
            cursor: "pointer",
          },
          listeners: [
            {
              type: "click",
              listener: async () => {
                const numbers = await getFilesNumber(Zotero.DataDirectory.dir + '\\' + 'PdfConversation');  // 获取已有文件序号
                const resultDisplay = dialogHelper.window?.document.querySelector('[data-content-display]') as HTMLElement;
                const nextButton = dialogHelper.window?.document.querySelector('[data-next-conversation]') as HTMLButtonElement;
                const previousButton = dialogHelper.window?.document.querySelector('[data-previous-conversation]') as HTMLButtonElement;

                nextButton.disabled = false;
                nextButton.style.backgroundColor = "#f5f5f5";

                if (numbers.length === 0) {
                  resultDisplay.textContent = "无历史对话记录";
                  previousButton.disabled = true;
                  previousButton.style.backgroundColor = "#ccc";
                  return;
                }

                if (typeof id === 'undefined') {
                  id = numbers.length - 1;
                }

                if (id >= 0) {
                  const content = await getFileContent(id);  // 获取文件内容
                  if (content) {
                    try {
                      if (ZoteroFileHandler.isMarkdown(content)) {
                        resultDisplay.innerHTML = await marked.parse(content);
                      } else {
                        resultDisplay.textContent = content;
                      }
                    } catch (error) {
                      resultDisplay.innerHTML = "<p style='color: red;'>无法显示内容，请检查 Markdown 格式。</p>";
                      ztoolkit.log("Markdown 转换失败:", error);
                    }
                  } else {
                    resultDisplay.textContent = "读取上轮对话内容失败";
                  }
                  id--;
                  ztoolkit.log(`当前id: ${id}`);
                }
                else {
                  resultDisplay.textContent = "无历史对话记录";
                  previousButton.disabled = true;
                  previousButton.style.backgroundColor = "#ccc";
                  id = 0;
                }
              },
            },
          ],
        },

        {
          tag: "button",
          attributes:
          {
            "data-previous-conversation": "",
          },
          properties: {
            textContent: "↑ 上一条对话",
          },
          styles: {
            color: "rgb(37, 174, 238)",
            padding: "5px 15px",
            margin: "0 10px",
            minWidth: "100px", // 添加最小宽度使按钮大小一致
            fontSize: "14px",
            fontStyle: "bold",
            borderRadius: "14px",
            border: "1px solid rgb(37, 174, 238)",
            backgroundColor: "rgb(131, 204, 237)",
            cursor: "pointer",
          },
          listeners: [
            {
              type: "click",
              listener: async () => {
                const numbers = await getFilesNumber(Zotero.DataDirectory.dir + '\\' + 'PdfConversation');  // 获取已有文件序号
                const resultDisplay = dialogHelper.window?.document.querySelector('[data-content-display]') as HTMLElement;
                const nextButton = dialogHelper.window?.document.querySelector('[data-next-conversation]') as HTMLButtonElement;
                const previousButton = dialogHelper.window?.document.querySelector('[data-previous-conversation]') as HTMLButtonElement;

                nextButton.disabled = false;
                nextButton.style.backgroundColor = "#f5f5f5";

                if (numbers.length === 0) {
                  resultDisplay.textContent = "无历史对话记录";
                  previousButton.disabled = true;
                  previousButton.style.backgroundColor = "#ccc";
                  return;
                }

                if (typeof id === 'undefined') {
                  id = numbers.length - 1;
                }

                if (id >= 0) {
                  const content = await getFileContent(id);  // 获取文件内容
                  if (content) {
                    try {
                      if (ZoteroFileHandler.isMarkdown(content)) {
                        resultDisplay.innerHTML = await marked.parse(content);
                      } else {
                        resultDisplay.textContent = content;
                      }
                    } catch (error) {
                      resultDisplay.innerHTML = "<p style='color: red;'>无法显示内容，请检查 Markdown 格式。</p>";
                      ztoolkit.log("Markdown 转换失败:", error);
                    }
                  } else {
                    resultDisplay.textContent = "读取上轮对话内容失败";
                  }
                  id--;
                  ztoolkit.log(`当前id: ${id}`);
                }
                else {
                  resultDisplay.textContent = "无历史对话记录";
                  previousButton.disabled = true;
                  previousButton.style.backgroundColor = "#ccc";
                  id = 0;
                }
              },
            },
          ],
        },
        {
          tag: "button",
          attributes:
          {
            "data-previous-conversation": "",
          },
          properties: {
            textContent: "上一条对话",
          },
          styles: {
            color: "rgb(37, 174, 238)",
            padding: "5px 15px",
            margin: "0 10px",
            minWidth: "100px", // 添加最小宽度使按钮大小一致
            fontSize: "14px",
            fontStyle: "bold",
            borderRadius: "14px",
            border: "1px solid rgb(37, 174, 238)",
            backgroundColor: "rgb(131, 204, 237)",
            cursor: "pointer",
          },
          listeners: [
            {
              type: "click",
              listener: async () => {
                const numbers = await getFilesNumber(Zotero.DataDirectory.dir + '\\' + 'PdfConversation');  // 获取已有文件序号
                const resultDisplay = dialogHelper.window?.document.querySelector('[data-content-display]') as HTMLElement;
                const nextButton = dialogHelper.window?.document.querySelector('[data-next-conversation]') as HTMLButtonElement;
                const previousButton = dialogHelper.window?.document.querySelector('[data-previous-conversation]') as HTMLButtonElement;

                nextButton.disabled = false;
                nextButton.style.backgroundColor = "#f5f5f5";

                if (numbers.length === 0) {
                  resultDisplay.textContent = "无历史对话记录";
                  previousButton.disabled = true;
                  previousButton.style.backgroundColor = "#ccc";
                  return;
                }

                if (typeof id === 'undefined') {
                  id = numbers.length - 1;
                }

                if (id >= 0) {
                  const content = await getFileContent(id);  // 获取文件内容
                  if (content) {
                    try {
                      if (ZoteroFileHandler.isMarkdown(content)) {
                        resultDisplay.innerHTML = await marked.parse(content);
                      } else {
                        resultDisplay.textContent = content;
                      }
                    } catch (error) {
                      resultDisplay.innerHTML = "<p style='color: red;'>无法显示内容，请检查 Markdown 格式。</p>";
                      ztoolkit.log("Markdown 转换失败:", error);
                    }
                  } else {
                    resultDisplay.textContent = "读取上轮对话内容失败";
                  }
                  id--;
                  ztoolkit.log(`当前id: ${id}`);
                }
                else {
                  resultDisplay.textContent = "无历史对话记录";
                  previousButton.disabled = true;
                  previousButton.style.backgroundColor = "#ccc";
                  id = 0;
                }
              },
            },
          ],
        },
      ],
    });


    dialogHelper.setDialogData(dialogData).open("", { fitContent: true, centerscreen: true, resizable: true});
    addon.data.dialog = dialogHelper;

    dialogHelper.window?.addEventListener("unload", async () => {
      await deletePdfConversationFiles(Zotero.DataDirectory.dir + '\\' + 'PdfConversation');
      await dialogData.unloadLock.promise;
      addon.data.dialog = undefined;
    });
  };

  // 定义工具栏渲染事件处理函数
  const toolbarRenderHandler: _ZoteroTypes.Reader.EventHandler<"renderToolbar"> = (event) => {
    ztoolkit.log("检测到 PDF 工具栏渲染事件，PDF 可能已打开。", event);
    // 通过 event.reader 获取当前 PDF 阅读器实例的状态信息
    ztoolkit.log("当前 PDF 状态：", event.reader);
  };

  // 注册事件监听器
  Zotero.Reader.registerEventListener("renderTextSelectionPopup", textSelectionHandler, pluginID);
  Zotero.Reader.registerEventListener("renderToolbar", toolbarRenderHandler, pluginID);
  ztoolkit.log("PDF 事件监听器已注册。");

  // 在窗口卸载时自动注销监听器
  Zotero.getMainWindow().addEventListener("unload", () => {
    Zotero.Reader.unregisterEventListener("renderTextSelectionPopup", textSelectionHandler);
    Zotero.Reader.unregisterEventListener("renderToolbar", toolbarRenderHandler);
    ztoolkit.log("PDF 事件监听器已在窗口卸载时注销。");
  });

}



// 保存对话结果到文件
export async function saveConversationResult(id: number, content: string) {
  const dataDir = Zotero.DataDirectory;
  const pdfConversationPath = PathUtils.join(dataDir.dir, 'PdfConversation');

  // 创建文件路径
  const filePath = PathUtils.join(pdfConversationPath, `${id}.txt`);

  // 写入内容到文件
  try {
    await Zotero.File.putContentsAsync(filePath, content);
    ztoolkit.log(`文件已保存: ${filePath}`);
  } catch (error) {
    ztoolkit.log(`保存文件失败: ${filePath}`, error);
  }
}


// 获取所有文件序号
export async function getFilesNumber(path: string): Promise<number[]> {
  const fileNames: string[] = [];

  const onEntry = (entry: OS.File.Entry) => {
    if (entry.name) {
      fileNames.push(entry.name);
    }
  };

  try {
    await Zotero.File.iterateDirectory(path, onEntry);
    // 提取文件名中的数字并排序
    const numbers = fileNames
      .map((name) => {
        const match = name.match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
      })
      .sort((a, b) => a - b);

    ztoolkit.log(`Sorted numbers: ${numbers.join(', ')}`);
    return numbers;
  } catch (error) {
    ztoolkit.log(`Error iterating directory: ${error}`);
    throw error; // 重新抛出错误以便在外部处理
  }
}


// 获取指定文件内容
export async function getFileContent(id: number): Promise<string> {
  // 构建文件名
  const fileName = `${id}.txt`;
  const filePath = PathUtils.join(Zotero.DataDirectory.dir, 'PdfConversation', fileName);

  const fileContent = await Zotero.File.getContentsAsync(filePath, 'utf8');
  if (typeof fileContent !== 'string') {
    throw new Error('Failed to read file content as string');
  }
  ztoolkit.log(`获得文件内容: ${fileContent}`);
  return fileContent;

}

// Function to delete all files in the PdfConversation directory
export async function deletePdfConversationFiles(path: any) {

  const onEntry = (entry: OS.File.Entry) => {
    if (entry.name) {
      Zotero.File.removeIfExists(entry.path);
    }
  };

  try {
    await Zotero.File.iterateDirectory(path, onEntry);
    ztoolkit.log(`所有文件已经删除`);
  } catch (error) {
    ztoolkit.log(`Error iterating directory: ${error}`);
    throw error; // 重新抛出错误以便在外部处理
  }
}