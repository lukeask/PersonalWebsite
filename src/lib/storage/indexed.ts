import Dexie, { type Table } from "dexie";

export interface OverlayFileRecord {
  path: string;
  content: string;
  created: number;
  modified: number;
  deleted: boolean;
}

class AskewFsDb extends Dexie {
  files!: Table<OverlayFileRecord, string>;

  constructor() {
    super("askew-fs");
    this.version(1).stores({
      // path is primary key; modified and path are indexed for queries
      files: "path, modified",
    });
  }
}

export class OverlayStorage {
  private db: AskewFsDb;

  constructor() {
    this.db = new AskewFsDb();
  }

  async getFile(path: string): Promise<OverlayFileRecord | null> {
    return (await this.db.files.get(path)) ?? null;
  }

  async putFile(path: string, content: string, created?: number): Promise<void> {
    const now = Date.now();
    const existing = await this.getFile(path);
    await this.db.files.put({
      path,
      content,
      created: existing?.created ?? created ?? now,
      modified: now,
      deleted: false,
    });
  }

  async deleteFile(path: string): Promise<void> {
    const now = Date.now();
    const existing = await this.getFile(path);
    await this.db.files.put({
      path,
      content: existing?.content ?? "",
      created: existing?.created ?? now,
      modified: now,
      deleted: true,
    });
  }

  async listDir(dirPath: string): Promise<OverlayFileRecord[]> {
    const prefix = dirPath === "/" ? "/" : dirPath + "/";
    return this.db.files.filter((f) => f.path.startsWith(prefix)).toArray();
  }

  async isDeleted(path: string): Promise<boolean> {
    const record = await this.getFile(path);
    return record?.deleted ?? false;
  }

  async getAll(): Promise<OverlayFileRecord[]> {
    return this.db.files.toArray();
  }

  async clearAll(): Promise<void> {
    await this.db.files.clear();
  }
}
