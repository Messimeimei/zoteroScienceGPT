// 操作zotero中的文库，集合和条目
import { getLocaleID, getString } from "../utils/locale";

type Collection = any; // Placeholder for actual Zotero.Collection type
type Item = any; // Placeholder for actual Zotero.Item type

type NotificationCallback = {
    notify: (
        event: string,
        type: string,
        ids: number[] | string[],
        extraData: { [key: string]: any }
    ) => void;
};

function zoteroLogger(
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
) {
    const original = descriptor.value;
    descriptor.value = function (...args: any) {
        try {
            ztoolkit.log(`Calling ${String(propertyKey)} in ${target.constructor.name}`);
            return original.apply(this, args);
        } catch (e) {
            ztoolkit.log(`Error in ${String(propertyKey)}:`, e);
            throw e;
        }
    };
    return descriptor;
}

export class ZoteroFileHandler {
    private static notifierID: string;

    @zoteroLogger
    static registerCollectionNotifier() {
        const callback: NotificationCallback = {
            notify: async (event, type, ids, extraData) => {
                if (type === "collection" && event === "select") {
                    for (const collectionID of ids) {
                        await this.createChildItem(collectionID);
                    }
                }
            },
        };

        this.notifierID = Zotero.Notifier.registerObserver(callback, ["collection"]);

        Zotero.Plugins.addObserver({
            shutdown: () => {
                Zotero.Notifier.unregisterObserver(this.notifierID);
            },
        });
    }

    @zoteroLogger
    static async createChildItem(collectionID: number | string) {
        try {
            // 确保 collectionID 是 number 类型
            const id = typeof collectionID === "string" ? parseInt(collectionID, 10) : collectionID;

            // 检查转换结果是否有效
            if (isNaN(id)) {
                ztoolkit.log(`Invalid collection ID: ${collectionID}`);
                return;
            }

            const collection: Collection = Zotero.Collections.get(id);
            if (!collection) {
                ztoolkit.log(`Collection with ID ${id} not found.`);
                return;
            }

            const newItem: Item = new Zotero.Item("note");
            newItem.setNote("Automatically created note");
            newItem.saveTx();

            collection.addItem(newItem.id);

            const progressWindow = new ztoolkit.ProgressWindow("Zotero Plugin");
            progressWindow.createLine({
                text: `New item created in collection: ${collection.name}`,
                type: "success",
                progress: 100,
            });
            progressWindow.show();
        } catch (error) {
            ztoolkit.log(`Error creating child item for collection ${collectionID}:`, error);
        }
    }

}
