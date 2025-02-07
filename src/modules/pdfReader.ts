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
// import * as fs from "fs";
// import pdf from "pdf-parse";

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
  const textSelectionHandler: _ZoteroTypes.Reader.EventHandler<"renderTextSelectionPopup"> = (event) => {
    let result: any;
    const pdfItemId = event.reader.itemID;
    const selectedText = event.params?.annotation?.text || "";
    
    // 创建输入框容器
    const container = event.doc.createElement("div");
    container.style.cssText = 
      "background-color: rgba(242, 242, 242, 0.5); padding: 15px 0 15px 0; border: 1px solid #ccc; border-radius: 8px; width: 500px; height: 300px; overflow-y: auto; display: flex; flex-direction: column; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1); margin-left: 10px;" // 修正左边超出问题
    ;
    
    // 创建输入框
    const input = event.doc.createElement("input");
    input.type = "text";
    input.value = "请输入问题";
    input.style.cssText = 
      "width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 10px; font-size: 14px;"
    ;
    
    // 创建结果显示区
    const resultDiv = event.doc.createElement("div");
    resultDiv.style.cssText = 
      "margin-top: 10px; display: none; flex: 1; overflow-y: auto; padding: 10px; background-color: white; border-radius: 4px; font-size: 14px; line-height: 1.5; userSelect: text"
    ;
    
    container.appendChild(input);
    container.appendChild(resultDiv);
    event.append(container);

    // 输入框获得焦点时清空默认文字
    input.addEventListener("focus", () => {
      if (input.value === "请输入问题") {
        input.value = "";
      }
    });

    // 处理回车事件
    input.addEventListener("keypress", async (e) => {
      if (e.key === "Enter" && input.value.trim() !== "" && input.value !== "请输入问题") {
        const question = input.value;
        input.value = "处理中...";
        input.disabled = true;

        try {
          if (pdfItemId) {
            const pdfText = await ZoteroFileHandler.getPdfInfoById(pdfItemId);
            if (pdfText) {
              result = await sendMessageToSingleConversationAPI(
                question, selectedText, pdfText);

              if (result && result.decoder) {
                const { response, decoder } = result;
                result = extractStreamData(response);
              }
              
              resultDiv.style.display = "block";
              // 判断是否为 Markdown 格式并相应处理
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
              input.style.display = "none";
            }
          }
        } catch (error) {
          resultDiv.style.display = "block";
          resultDiv.textContent = "处理出错：" + (error as Error).message;
          input.style.display = "none";
        }
      }
    });

    // 点击外部区域关闭
    const closeHandler = (e: MouseEvent) => {
      if (!container.contains(e.target as Node)) {
        event.doc.removeEventListener("click", closeHandler);
        container.remove();
      }
    };
    
    // 延迟添加点击监听，避免立即触发
    setTimeout(() => {
      event.doc.addEventListener("click", closeHandler);
    }, 100);
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