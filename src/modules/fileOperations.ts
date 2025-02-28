import { get } from "http";
import { getLocaleID, getString } from "../utils/locale";
import { sendMessageToClassficationAPI, extractStreamData, displayReceivedMessage, sendMessageToAbstractionAPI, sendMessageToNoterAPI } from "./sideBarChat";
import { marked } from "marked";

export class ZoteroFileHandler {

    // 为用户创建存储文件元数据，每次启动zotero时运行
    static async createUserData() {
        ztoolkit.log("开始")
        const dataDir = Zotero.DataDirectory;  // This gives you the path to the data directory
        const dataDirPath = dataDir.dir
        ztoolkit.log("查看dataDirPath：", dataDirPath)
        const relativePath = 'userData';
        const targetPath = dataDirPath + '\\' + relativePath;
        ztoolkit.log("查看：", targetPath)
        try {
            await Zotero.File.createDirectoryIfMissingAsync(targetPath);
            ztoolkit.log(`文件夹已创建或已存在: ${targetPath}`);
        } catch (error) {
            ztoolkit.log(`创建文件夹失败: ${targetPath}`, error);
        }

        // 创建 PdfConversation 文件夹
        const pdfConversationPath = dataDirPath + '\\PdfConversation';
        try {
            await Zotero.File.createDirectoryIfMissingAsync(pdfConversationPath);
            ztoolkit.log(`文件夹已创建或已存在: ${pdfConversationPath}`);
        } catch (error) {
            ztoolkit.log(`创建文件夹失败: ${pdfConversationPath}`, error);
        }

        // 创建 文献笔记 文件夹
        const notePath = dataDirPath + '\\notes';
        try {
            await Zotero.File.createDirectoryIfMissingAsync(notePath);
            ztoolkit.log(`文件夹已创建或已存在: ${notePath}`);
        } catch (error) {
            ztoolkit.log(`创建文件夹失败: ${notePath}`, error);
        }
    }

    // 注册一个回调函数，可以在外部获取单个条目数据
    static getItemDataCallback: ((itemData: { [key: string]: any } | null) => void) | null = null;

    // 注册一个回调函数，可以在外部获取单个文件夹下所有条目数据
    static getAllItemDataCallback: ((allItemData: { [key: string]: any } | null) => void) | null = null;

    // 已知的所有可能的字段名称列表
    static allFields = [
        "title",
        "firstCreator",
        "abstractNote",
        "artworkMedium",
        "medium",
        "artworkSize",
        "date",
        "language",
        "shortTitle",
        "archive",
        "archiveLocation",
        "libraryCatalog",
        "callNumber",
        "url",
        "accessDate",
        "rights",
        "extra",
        "audioRecordingFormat",
        "seriesTitle",
        "volume",
        "numberOfVolumes",
        "place",
        "label",
        "publisher",
        "runningTime",
        "ISBN",
        "billNumber",
        "number",
        "code",
        "codeVolume",
        "section",
        "codePages",
        "pages",
        "legislativeBody",
        "session",
        "history",
        "blogTitle",
        "publicationTitle",
        "websiteType",
        "type",
        "series",
        "seriesNumber",
        "edition",
        "numPages",
        "bookTitle",
        "caseName",
        "court",
        "dateDecided",
        "docketNumber",
        "reporter",
        "reporterVolume",
        "firstPage",
        "versionNumber",
        "system",
        "company",
        "programmingLanguage",
        "proceedingsTitle",
        "conferenceName",
        "DOI",
        "dictionaryTitle",
        "subject",
        "encyclopediaTitle",
        "distributor",
        "genre",
        "videoRecordingFormat",
        "forumTitle",
        "postType",
        "committee",
        "documentNumber",
        "interviewMedium",
        "issue",
        "seriesText",
        "journalAbbreviation",
        "ISSN",
        "letterType",
        "manuscriptType",
        "mapType",
        "scale",
        "country",
        "assignee",
        "issuingAuthority",
        "patentNumber",
        "filingDate",
        "applicationNumber",
        "priorityNumbers",
        "issueDate",
        "references",
        "legalStatus",
        "episodeNumber",
        "audioFileType",
        "repository",
        "archiveID",
        "citationKey",
        "presentationType",
        "meetingName",
        "programTitle",
        "network",
        "reportNumber",
        "reportType",
        "institution",
        "nameOfAct",
        "codeNumber",
        "publicLawNumber",
        "dateEnacted",
        "thesisType",
        "university",
        "studio",
        "websiteTitle",
        "id",
        "year",
        "annotation"
    ];

    // 根据条目 ID 获取条目信息 
    static async getItemInfoById(itemId: number) {
        try {
            const item = Zotero.Items.get(itemId);
            if (item) {
                const itemData: { [key: string]: any } = {};
                for (const field of ZoteroFileHandler.allFields) {
                    const fieldValue = item.getField(field as Zotero.Item.ItemField);
                    // 空值不加入到字典中
                    if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
                        itemData[field] = fieldValue;
                    }
                }
                return itemData;
            } else {
                ztoolkit.log(`未找到ID为 ${itemId} 的条目`);
                return null;
            }
        } catch (error) {
            ztoolkit.log(`获取ID为 ${itemId} 的条目信息时出错`, error);
            return null;
        }
    }

    // 根据PDF ID 获取全文 
    static async getPdfInfoById(pdfItemID: number) {
        try {
            const item = Zotero.Items.get(pdfItemID);
            // 判断附件是否存在
            if (item) {
                const isPdf = item.isPDFAttachment();
                // 判断是不是pdf
                if (isPdf) {
                    const itemData = await item.attachmentText;
                    ztoolkit.log("获取的PDF文本内容：", itemData); // 添加调试日志
                    return itemData;
                } else {
                    ztoolkit.log(`未找到ID为 ${pdfItemID} 的pdf`);
                    return null;
                }
            } else {
                ztoolkit.log(`未找到ID为 ${pdfItemID} 的pdf`);
                return null;
            }
        } catch (error) {
            ztoolkit.log(`获取ID为 ${pdfItemID} 的条目信息时出错`, error);
            return null;
        }
    }

    // 注册监听集合的选中
    static async getCollectionByItemId(itemId: number) {
        try {
            const item = Zotero.Items.get(itemId);
            if (item) {
                const collections = item.getCollections()
                return { collections };
            } else {
                ztoolkit.log(`未找到 ID 为 ${itemId} 的条目`);
                return null;
            }
        } catch (error) {
            ztoolkit.log(`获取条目 ID 为 ${itemId} 的信息时出错`, error);
            return null;
        }
    }

    // 注册监听条目的选中，里面有当前选中的条目 ID
    static async registerItemListener() {
        Zotero.ItemPaneManager.registerSection({
            paneID: "item-listener",
            pluginID: addon.data.config.addonID,
            header: {
                l10nID: getLocaleID("item-section-example2-head-text"),
                l10nArgs: `{"status": "Initialized"}`,
                icon: "chrome://zotero/skin/16/universal/book.svg",
            },
            sidenav: {
                l10nID: getLocaleID("sidenav-chat-section-tooltip"),
                icon: `chrome://${addon.data.config.addonRef}/content/icons/chat.png`,
            },
            // 当节初始化时调用
            onInit: ({ item }) => {
                ztoolkit.log("Section init!", item?.id);
            },
            // 当节销毁时调用
            onDestroy: (props) => {
                ztoolkit.log("Section destroy!");
            },
            // 当条目更改时调用
            onItemChange: async ({ item, setEnabled, tabType }) => {
                const itemId = item?.id;  // 当前选中条目的id
                if (itemId) {
                    ztoolkit.log(`当前选中的条目 ID 是： ${itemId}`);
                    const itemInfo = await ZoteroFileHandler.getItemInfoById(itemId);
                    const collection_ids = await ZoteroFileHandler.getCollectionByItemId(itemId);
                    if (collection_ids) {
                        const ZoteroPane = Zotero.getActiveZoteroPane();
                        const collection = ZoteroPane.getSelectedCollection()
                        const collectionName = collection?.name
                        const items = collection?.getChildItems()
                        ztoolkit.log("条目所在集合：", collectionName)
                        // 调用外部回调，返回条目所在集合的所有信息
                        ztoolkit.log("条目所在集合下所有条目：", items)

                        // 提取所有条目数据
                        if (items && items.length > 0) {
                            const allItemDataMap: { [key: string]: any } = {};
                            for (const item of items) {
                                const itemId = item.id;
                                const itemData = await ZoteroFileHandler.getItemInfoById(itemId);
                                if (itemData) {
                                    ztoolkit.log("查看单个条目:", itemData)
                                    allItemDataMap[itemData.id] = itemData;   // 用文章名称为键，元数据为值
                                } else {
                                    ztoolkit.log(`无法获取条目 ID 为 ${itemId} 的数据`);
                                }
                            }
                            ztoolkit.log("条目所在文件夹所有数据", allItemDataMap);
                            // 调用外部回调返回选中条目所在文件夹中所有条目信息
                            if (ZoteroFileHandler.getAllItemDataCallback) {
                                ZoteroFileHandler.getAllItemDataCallback(allItemDataMap);
                            }
                        }

                    };

                    if (itemInfo) {
                        ztoolkit.log("回调函数返回的：条目数据：", itemInfo);
                        // 调用外部回调，如果外部注册了回调函数，这里就返回条目信息
                        if (ZoteroFileHandler.getItemDataCallback) {
                            ZoteroFileHandler.getItemDataCallback(itemInfo);
                        }
                    }
                } else {
                    ztoolkit.log("未选中任何条目");
                }
                setEnabled(tabType === "reader");
                return true;
            },
            // 当节渲染时调用
            onRender: ({ body, }) => {
                ztoolkit.log("走到这里")
                const doc = body.querySelector('#zotero-item-pane-message-box');
                ztoolkit.log("是否有了？？", doc)

            },
            // 异步渲染
            onAsyncRender: async ({
                body,
                item,
                setL10nArgs,
                setSectionSummary,
                setSectionButtonStatus,
            }) => {
                ztoolkit.log("Section secondary render start!", item?.id);
                await Zotero.Promise.delay(1000);
                ztoolkit.log("Section secondary render finish!", item?.id);
                const title = body.querySelector("#test") as HTMLElement;
                title.style.color = "green";
                title.textContent = item.getField("title");
                setL10nArgs(`{ "status": "Loaded" }`);
                setSectionSummary("rendered!");
                setSectionButtonStatus("test", { hidden: false });
            },
            // 当节切换时调用
            onToggle: ({ item }) => {
                ztoolkit.log("Section toggled!", item?.id);
            },
            // 节头部的按钮
            sectionButtons: [
                {
                    type: "test",
                    icon: "chrome://zotero/skin/16/universal/empty-trash.svg",
                    l10nID: getLocaleID("item-section-example2-button-tooltip"),
                    onClick: ({ item, paneID }) => {
                        ztoolkit.log("Section clicked!", item?.id);
                        Zotero.ItemPaneManager.unregisterSection(paneID);
                    },
                },
            ],
        });
    }

    // 功能一、文件夹分类，为文件夹注册一个新的右键分类功能
    static registerFolderClassificationTest() {
        const menuIcon = `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`;
        // item menuitem with icon
        ztoolkit.Menu.register("collection", {
            tag: "menuitem",
            id: "zotero-collectionmenu-folder-classification",
            label: getString("menuitem-label"),
            commandListener: (ev) => addon.hooks.onDialogEvents("classification"),
            icon: menuIcon,
        });
    }

    // 展示文献分类的弹窗，具体实现对单个/所有文件夹中文件实现分类
    static async showClassificationDialog(content: string = "") {
        let result: any; // 在函数开头声明
        const dialogData: { [key: string | number]: any } = {
            loadCallback: () => {
                ztoolkit.log("分类对话框已打开");
            },
            unloadCallback: () => {
                ztoolkit.log("分类对话框已关闭");
            },
        };

        const dialogHelper = new ztoolkit.Dialog(4, 1)  // 改为只有1列
            // 第一段：开始整理按钮
            .addCell(0, 0, {
                tag: "div",
                styles: {
                    display: "flex",
                    justifyContent: "center",  // 改为center
                    width: "100%",
                    margin: "10px 0"
                },
                children: [
                    {
                        tag: "button",
                        namespace: "html",
                        attributes: { type: "button" },
                        properties: { innerHTML: "开始整理" },
                        styles: {
                            padding: "5px 15px",
                            margin: "0 10px",
                            minWidth: "120px"  // 添加最小宽度使按钮大小一致
                        },
                        listeners: [{
                            type: "click",
                            listener: async () => {
                                // 实现单文件夹整理
                                ztoolkit.log("选择了开始整理");
                                // 获取当前选中的集合
                                const ZoteroPane = Zotero.getActiveZoteroPane();
                                const collection = ZoteroPane.getSelectedCollection();

                                // 更新内容展示框为“正在处理中，请稍等^_^”
                                const contentDiv = dialogHelper.window?.document.querySelector('[data-content-display]');
                                if (contentDiv) {
                                    contentDiv.innerHTML = "正在处理中，请稍等^_^";
                                }

                                if (!collection) {
                                    if (contentDiv) {
                                        contentDiv.innerHTML = "请先选择一个文件夹！";
                                    }
                                    return;
                                } else {
                                    const collectionName = collection?.name
                                    const items = collection?.getChildItems()
                                    ztoolkit.log("条目所在集合：", collectionName)
                                    // 调用外部回调，返回条目所在集合的所有信息
                                    ztoolkit.log("条目所在集合下所有条目：", items)

                                    // 提取所有条目数据
                                    if (items && items.length > 0) {
                                        const allItemDataMap: { [key: string]: any } = {};
                                        for (const item of items) {
                                            const itemId = item.id;
                                            const itemData = await ZoteroFileHandler.getItemInfoById(itemId);
                                            if (itemData) {
                                                ztoolkit.log("查看单个条目:", itemData)
                                                allItemDataMap[itemData.id] = itemData;   // 用文章名称为键，元数据为值
                                            } else {
                                                ztoolkit.log(`无法获取条目 ID 为 ${itemId} 的数据`);
                                            }
                                        }
                                        ztoolkit.log("条目所在文件夹所有数据", allItemDataMap);
                                        result = await sendMessageToClassficationAPI("对下列文献进行分类：\n", true, "", allItemDataMap);

                                        if (result && result.decoder) {
                                            const { response, decoder } = result;
                                            const contentDiv = dialogHelper.window?.document.querySelector('[data-content-display]');

                                            if (contentDiv) {
                                                // 直接使用 displayReceivedMessage 函数
                                                result = displayReceivedMessage(response, decoder, dialogHelper.window?.document.body, contentDiv);
                                            }
                                            ztoolkit.log(result);
                                        }
                                    }
                                }

                            }
                        }]
                    },

                ]
            })
            // 第二段：可滚动的内容展示框
            .addCell(1, 0, {
                tag: "div",
                attributes: {
                    "data-content-display": ""  // 添加标识属性
                },
                styles: {
                    width: "calc(100% - 40px)",  // 减去左右padding
                    height: "200px",
                    margin: "10px auto",  // 使用auto实现水平居中
                    padding: "10px",
                    border: "1px solid #ccc",
                    overflowY: "auto",
                    backgroundColor: "#f5f5f5"
                },
                properties: {
                    innerHTML: content || "暂无内容"
                }
            })
            // 第三段：确定和取消按钮
            .addCell(2, 0, {
                tag: "div",
                styles: {
                    display: "flex",
                    justifyContent: "center",  // 居中显示按钮
                    width: "100%",
                    margin: "10px 0"
                },
                children: [
                    {
                        tag: "button",
                        namespace: "html",
                        attributes: { type: "button" },
                        properties: { innerHTML: "确定" },
                        styles: {
                            padding: "5px 15px",
                            margin: "0 10px",
                            minWidth: "80px"
                        },
                        listeners: [{
                            type: "click",
                            listener: () => {
                                ztoolkit.log("点击了确定按钮");
                                try {
                                    // 尝试解析result
                                    if (result) {
                                        // 检查并去除result开头的```json和结尾的```
                                        if (result.startsWith('```json') && result.endsWith('```')) {
                                            result = result.slice(7, -3);
                                        }
                                        ztoolkit.log("查看返回结果：", result)
                                        const parsedResult = JSON.parse(result);
                                        ztoolkit.log("解析成功，结果为:", parsedResult);
                                        // 遍历解析后的结果
                                        for (const folderInfo of parsedResult) {
                                            ztoolkit.log("当前处理的文件夹信息:", folderInfo);
                                            const { name, ids, parentID } = folderInfo;
                                            ZoteroFileHandler.createNewFolder(name, ids, parentID);
                                        }
                                    } else {
                                        throw new Error("result 为空");
                                    }
                                } catch (error: unknown) {
                                    ztoolkit.getGlobal("alert")(`解析结果失败: ${(error as Error).message}`);
                                }
                                dialogHelper.window?.close();
                            }
                        }]
                    },
                    {
                        tag: "button",
                        namespace: "html",
                        attributes: { type: "button" },
                        properties: { innerHTML: "取消" },
                        styles: {
                            padding: "5px 15px",
                            margin: "0 10px",
                            minWidth: "80px"
                        },
                        listeners: [{
                            type: "click",
                            listener: () => {
                                ztoolkit.log("点击了取消按钮");
                                dialogHelper.window?.close();
                            }
                        }]
                    }
                ]
            })
            .setDialogData(dialogData)
            .open("文献整理");
    }

    // 根据dify返回的结果注册新的创建新的文件夹和复制文件
    static async createNewFolder(name: string, ids: number[], parentID?: number) {
        try {
            // 创建新的收藏集对象
            const newCollection = new Zotero.Collection();
            newCollection.name = name;

            // 设置父文件夹ID（如果有的话）
            if (parentID !== undefined) {
                newCollection.parentID = parentID;
            }

            // 保存收藏集到数据库
            await newCollection.saveTx();

            // 将文献添加到新收藏集中
            const items = Zotero.Items.get(ids)
            for (const item of items) {
                const itemData = await ZoteroFileHandler.getItemInfoById(item.id);
                ztoolkit.log("查看item数据：", itemData)
                ztoolkit.log("查看新文件夹id：", newCollection.id)
                item.addToCollection(newCollection.id);
                await item.saveTx()
            }

            ztoolkit.log(`成功创建文件夹 "${name}" 并添加了 ${items.length} 个条目`);
            return newCollection;
        } catch (error) {
            ztoolkit.log(`创建文件夹失败: ${error}`);
            throw error;
        }
    }

    // 功能二、一次性更新点击一个文件夹右侧展示的内容
    static async topicAbstract() {
        let result: any;

        const windows = Zotero.getMainWindows();

        for (const win of windows) {
            const doc = win.document;

            // 获取右侧 message box 容器
            const messageBox = doc.getElementById("zotero-item-pane-message-box");
            if (!messageBox) {
                ztoolkit.log("Message box not found!");
                continue;
            }

            // 设置父容器布局
            messageBox.style.display = "flex";
            messageBox.style.flexDirection = "column";
            messageBox.style.minHeight = "0";

            // 定义一个函数，用于清除 messageBox 内所有原始内容
            const clearMessageBox = () => {
                while (messageBox.firstChild) {
                    messageBox.removeChild(messageBox.firstChild);
                }
            };

            // 创建并插入自定义元素的方法
            const addCustomElement = async (content: string) => {
                // 清除所有原始内容（包括 Zotero 默认内容和之前的自定义内容）
                clearMessageBox();

                // 如果已经存在自定义元素，则直接更新；否则创建
                let customElement = doc.getElementById("custom-element");
                if (!customElement) {
                    customElement = ztoolkit.UI.createElement(doc, "div", {
                        properties: { id: "custom-element" },
                        styles: {
                            width: "100%",
                            height: "100%",
                            boxSizing: "border-box",
                            overflowY: "auto",
                            maxHeight: "700px",
                            padding: "10px",
                            backgroundColor: "#f0f0f0",
                            border: "1px solid #ccc",
                            borderRadius: "5px",
                            fontFamily: "Arial, sans-serif",
                            userSelect: "text"
                        },
                    });
                    messageBox.appendChild(customElement);
                }
                // 更新自定义元素内容
                customElement.innerHTML = content;
            };

            // 立即清除原有内容并显示当前集合的信息，而非先显示“加载中”
            // 这里先触发 onCollectionSelected 来处理当前选中集合
            const activePane = Zotero.getActiveZoteroPane();

            // 备份原始 onCollectionSelected 方法
            if (!activePane._originalOnCollectionSelected) {
                activePane._originalOnCollectionSelected = activePane.onCollectionSelected;
            }

            // 重写 onCollectionSelected 方法
            activePane.onCollectionSelected = async function (...args: unknown[]) {
                // 调用 Zotero 原始逻辑（如果需要）
                this._originalOnCollectionSelected.apply(this, ...args);

                // 清除 messageBox 中原有内容
                clearMessageBox();

                const currentCollection = activePane.getSelectedCollection();
                const collectionName = currentCollection?.name;
                const items = currentCollection?.getChildItems();
                ztoolkit.log("文献摘要功能——当前选中的文献集合：", collectionName);
                ztoolkit.log("文献摘要功能——当前选中文献集合下所有条目：", items);

                if (items && items.length > 0) {
                    // 1. 获取最新的元数据
                    const metaData: { [key: string]: any } = {};
                    for (const item of items) {
                        const itemId = item.id;
                        const itemData = await ZoteroFileHandler.getItemInfoById(itemId);
                        if (itemData) {
                            ztoolkit.log("查看单个条目:", itemData);
                            metaData[itemData.id] = itemData;
                        } else {
                            ztoolkit.log(`无法获取条目 ID 为 ${itemId} 的数据`);
                        }
                    }
                    ztoolkit.log("条目所在文件夹所有数据", metaData);

                    // 2. 处理本地元数据文件
                    const dataDir = Zotero.DataDirectory;
                    const dataDirPath = dataDir.dir;
                    const relativePath = 'userData';
                    const targetPath = dataDirPath + '\\' + relativePath;

                    // 构建文件名（自动处理特殊字符）
                    const jsonFileName = `metadata_${collectionName}.json`;
                    const jsonFilePath = PathUtils.join(targetPath, jsonFileName);

                    const fileExists = await IOUtils.exists(jsonFilePath);
                    ztoolkit.log("路径是否存在：", fileExists);

                    if (fileExists) {
                        const jsonDataResult = await Zotero.File.getContentsAsync(jsonFilePath, 'utf8');
                        if (typeof jsonDataResult !== 'string') {
                            throw new Error('Invalid file content type');
                        }
                        const localData = JSON.parse(jsonDataResult);
                        const localArticleIds = Object.keys(localData.articles).sort();
                        const newArticleIds = Object.keys(metaData).sort();
                        const isSame = JSON.stringify(localArticleIds) === JSON.stringify(newArticleIds);
                        ztoolkit.log('查看对比结果：', isSame);

                        if (isSame) {
                            // 如果对比一致，直接使用本地摘要
                            result = localData.summary;
                            ztoolkit.log("查看使用的本地摘要：", result);
                            ztoolkit.log("本地元数据中的论文序号与最新数据一致，直接采用本地摘要。");
                        } else {
                            // 数据不一致，则调用接口更新并写入本地元数据
                            ztoolkit.log("检测到论文序号变化，重新调用接口获取摘要。");
                            result = await sendMessageToAbstractionAPI("对下列文献进行主题摘要：", metaData);
                            if (result && result.decoder) {
                                const { response, decoder } = result;
                                result = extractStreamData(response);
                            }
                            const dataToWrite = { articles: metaData, summary: result };
                            await Zotero.File.putContentsAsync(jsonFilePath, JSON.stringify(dataToWrite, null, 2));
                            ztoolkit.log("本地元数据已更新：", jsonFilePath);
                        }
                    } else {
                        // 本地没有元数据，调用接口并写入
                        result = await sendMessageToAbstractionAPI("对下列文献进行主题摘要：", metaData);
                        if (result && result.decoder) {
                            const { response, decoder } = result;
                            result = extractStreamData(response);
                        }
                        const dataToWrite = { articles: metaData, summary: result };
                        ztoolkit.log('查看待更新数据:', dataToWrite);
                        await Zotero.File.putContentsAsync(jsonFilePath, JSON.stringify(dataToWrite, null, 2));
                        ztoolkit.log("本地元数据已更新：", jsonFilePath);
                    }

                    // 延时等待（200 毫秒），确保原始 UI 更新已完成
                    await new Promise(resolve => setTimeout(resolve, 50));

                    // 3. 根据 Markdown 格式判断更新展示内容
                    try {
                        if (ZoteroFileHandler.isMarkdown(result)) {
                            const htmlContent = marked.parse(result);
                            ztoolkit.log('查看是否有 markdown 内容：', result);
                            addCustomElement(await htmlContent);
                        } else {
                            ztoolkit.log('查看没有 markdown 内容的 result：', result);
                            await addCustomElement(result);
                        }
                    } catch (error) {
                        ztoolkit.log(`Markdown 转换失败: ${error}`);
                        ztoolkit.log("查看原始内容：", result);
                        await addCustomElement("<p style='color: red;'>无法显示内容，请检查 Markdown 格式。</p>");
                    }
                }

                ztoolkit.log("Collection switched, custom element updated");
            };

            // 新增：立即调用 onCollectionSelected 展示当前选中集合的内容
            activePane.onCollectionSelected();
        }
    }

    // 判断是否为 Markdown 格式的函数
    static isMarkdown(content: string): boolean {
        // 检查是否包含常见的Markdown符号，有一个符合就用markdown展示
        const markdownRegex = [
            /[#*\-+]/,      // 标题符号 (#) 和列表符号 (-、*、+)
            /\[.*\]\(.*\)/,  // 链接 [text](url)
            /(?:^|\s)>\s/,    // 引用符号 (>)
            /(?:^|\s)(\d+)\./, // 有序列表 (1.)
            /\*\*.*\*\*/,    // 粗体 (**text**)
            /__.*__/,        // 下划线粗体 (__text__)
            /`.*`/,          // 行内代码 (`code`)
            /\n\n/,          // 两个换行符，通常Markdown中用于段落分隔
        ];

        // 如果内容匹配任何一个正则表达式，则认为它是Markdown格式
        return markdownRegex.some((regex) => regex.test(content));
    }

    // 功能三、注册右键单篇文献阅读笔记生成功能
    static registerFolderClassification() {
        const menuIcon = `chrome://${addon.data.config.addonRef}/content/icons/chat.png`;
        // item menuitem with icon
        ztoolkit.Menu.register("item", {
            tag: "menuitem",
            id: "zotero-itemmenu-addontemplate-test",
            label: getString("abstract-label"),
            commandListener: (ev) => addon.hooks.onDialogEvents("downloadNote"),
            icon: menuIcon,
        });
    }

    // 展示文献笔记的弹窗，并提供下载功能
    static async downloadNoterDialog(content: string = "") {
        let result: any; // Declare result at the beginning
        let fileName: any;  // 保存笔记名称

        // Create the loading dialog
        const loadingDialogData: { [key: string | number]: any } = {
            loadCallback: () => {
                ztoolkit.log("Loading dialog opened");
            },
            unloadCallback: () => {
                ztoolkit.log("Loading dialog closed");
            },
        };

        const loadingDialog = new ztoolkit.Dialog(1, 1); // Only 1 column
        loadingDialog.addCell(0, 0, {
            tag: "div",
            styles: {
                width: "200px", // Subtract left and right padding
                height: "150px",
                margin: "10px auto", // Center horizontally
                padding: "10px",
                border: "1px solid #ccc",
                overflowY: "auto",
                backgroundColor: "#f5f5f5",
                display: "none", // Initially hidden
            },
            properties: {
                innerHTML: "正在生成笔记中......",
            },
        });
        loadingDialog.setDialogData(loadingDialogData).open("运行中");

        ztoolkit.log("Fetching notes...");
        const ZoteroPane = Zotero.getActiveZoteroPane();
        const item = await ZoteroPane.getSelectedItems()[0];
        const itemData = await this.getItemInfoById(item.id);
        if (itemData) {
            fileName = itemData.title;
        } else fileName = "未获得文献标题的文件";
        ztoolkit.log("Viewing single item:", itemData);
        const pdfItem = await item.getBestAttachment();
        if (pdfItem) {
            ztoolkit.log("Is it a PDF?", pdfItem.isPDFAttachment());
            const pdfText = await pdfItem.attachmentText;
            ztoolkit.log("Fetched PDF text content:", pdfText.slice(0, 100)); // Debug log
            ztoolkit.log("Viewing single item:", itemData);
            result = await sendMessageToNoterAPI("Generate reading notes for this document:\n", itemData, pdfText);
        } else {
            ztoolkit.log("Is it a PDF?", pdfItem);
            ztoolkit.log("Viewing single item:", itemData);
            result = await sendMessageToNoterAPI("Generate reading notes for this document:\n", itemData, null);
        }

        if (result && result.decoder) {
            const { response, decoder } = result;
            result = extractStreamData(response);
            try {
                if (ZoteroFileHandler.isMarkdown(result)) {
                    result = marked.parse(result);
                    ztoolkit.log('Checking for markdown content:', result);
                } else {
                    ztoolkit.log('Checking result without markdown content:', result);
                }
            } catch (error) {
                ztoolkit.log(`Markdown conversion failed: ${error}`);
                ztoolkit.log("Viewing raw content:", result);
            }
        } else {
            result = "No notes fetched";
        }

        // Close the loading dialog
        loadingDialog.window?.close();

        // Create the result dialog
        const resultDialogData: { [key: string | number]: any } = {
            loadCallback: () => {
                ztoolkit.log("Result dialog opened");
            },
            unloadCallback: () => {
                ztoolkit.log("Result dialog closed");
            },
        };

        const resultDialog = new ztoolkit.Dialog(4, 1);  // 告诉用户等待结果    

        resultDialog
            .addCell(0, 0, {
                tag: "div",
                attributes: {
                    "data-content-display": "" // Add identifier attribute
                },
                styles: {
                    width: "500px", // Subtract left and right padding
                    height: "500px",
                    margin: "10px auto", // Center horizontally
                    padding: "10px",
                    border: "1px solid #ccc",
                    overflowY: "auto",
                    backgroundColor: "#f5f5f5"
                },
                properties: {
                    innerHTML: result || "Generating reading notes..."
                }
            })
            .addCell(1, 0, {
                tag: "div",
                styles: {
                    display: "flex",
                    // Center buttons
                    width: "100%",
                    margin: "10px 0"
                },
                children: [
                    {
                        tag: "button",
                        namespace: "html",
                        attributes: { type: "button" },
                        properties: { innerHTML: "Download" },
                        styles: {
                            padding: "5px 15px",
                            margin: "0 10px",
                            minWidth: "80px"
                        },
                        listeners: [{
                            type: "click",
                            listener: async () => {
                                ztoolkit.log("Download button clicked");
                                try {
                                    // Check if result exists
                                    if (result) {
                                        // Remove ```json and ``` from the content if needed
                                        if (result.startsWith('```json') && result.endsWith('```')) {
                                            result = result.slice(7, -3);
                                        }

                                        ztoolkit.log("Viewing returned result:", result);

                                        // 保存对话结果到文件
                                        const dataDir = Zotero.DataDirectory;
                                        const pdfConversationPath = PathUtils.join(dataDir.dir, 'notes');

                                        // 创建文件路径
                                        const filePath = PathUtils.join(pdfConversationPath, `${fileName}.txt`);

                                        // 写入内容到文件
                                        try {
                                            await Zotero.File.putContentsAsync(filePath, result);
                                            ztoolkit.log(`文件已保存: ${filePath}`);
                                        } catch (error) {
                                            ztoolkit.log(`保存文件失败: ${filePath}`, error);
                                        }

                                        ztoolkit.log("File download initiated");
                                    } else {
                                        throw new Error("Result is empty");
                                    }
                                } catch (error: unknown) {
                                    ztoolkit.getGlobal("alert")(`Failed to parse result: ${(error as Error).message}`);
                                }
                                resultDialog.window?.close(); // Close the dialog after downloading
                            }
                        }]
                    },
                    {
                        tag: "button",
                        namespace: "html",
                        attributes: { type: "button" },
                        properties: { innerHTML: "Cancel" },
                        styles: {
                            padding: "5px 15px",
                            margin: "0 10px",
                            minWidth: "80px"
                        },
                        listeners: [{
                            type: "click",
                            listener: () => {
                                ztoolkit.log("Cancel button clicked");
                                resultDialog.window?.close(); // Close the result dialog
                            }
                        }]
                    }
                ]
            })
            .setDialogData(resultDialogData)
            .open("Document Notes");
    }


}



