// An in-memory journal folder for tests: the directory, file and writable interfaces the
// mirror uses (store/mirrorFile.ts), with the File System Access API's rules that matter —
// a writable is a copy committed on close() and dropped on abort(); getFileHandle without
// `create` on a missing file throws NotFoundError; a permission that is not granted throws
// NotAllowedError on every file operation, as the real handle does after a restart.

import type { MirrorDirectory, MirrorFile, MirrorWritable } from "../store/mirrorFile.ts";

export class FakeDirectory implements MirrorDirectory {
  readonly name: string;
  readonly files = new Map<string, string>();
  permission: PermissionState = "granted";
  // When set, every file operation throws it (the folder is gone, the disk is full).
  failWith: Error | null = null;
  // Committed writes (close() calls), for "exactly one write per store write".
  commits = 0;
  // Permission requests, for "re-requested with one click".
  requests = 0;

  constructor(name = "journal") {
    this.name = name;
  }

  text(fileName: string): string {
    return this.files.get(fileName) ?? "";
  }

  lines(fileName: string): string[] {
    return this.text(fileName)
      .split("\n")
      .filter((line) => line !== "");
  }

  private check(): void {
    if (this.failWith !== null) {
      throw this.failWith;
    }
    if (this.permission !== "granted") {
      throw new DOMException("The request is not allowed by the user agent", "NotAllowedError");
    }
  }

  async getFileHandle(fileName: string, options?: { create?: boolean }): Promise<MirrorFile> {
    this.check();
    if (!this.files.has(fileName)) {
      if (options?.create !== true) {
        throw new DOMException(`${fileName} not found`, "NotFoundError");
      }
      this.files.set(fileName, "");
    }
    return new FakeFile(this, fileName);
  }

  async queryPermission(): Promise<PermissionState> {
    return this.permission;
  }

  async requestPermission(): Promise<PermissionState> {
    this.requests += 1;
    return this.permission;
  }

  // For FakeFile.
  guard(): void {
    this.check();
  }
}

class FakeFile implements MirrorFile {
  constructor(
    private readonly directory: FakeDirectory,
    private readonly fileName: string,
  ) {}

  async getFile(): Promise<{ size: number }> {
    this.directory.guard();
    return { size: this.directory.text(this.fileName).length };
  }

  async createWritable(options?: { keepExistingData?: boolean }): Promise<MirrorWritable> {
    this.directory.guard();
    const initial = options?.keepExistingData === true ? this.directory.text(this.fileName) : "";
    return new FakeWritable(this.directory, this.fileName, initial);
  }
}

class FakeWritable implements MirrorWritable {
  private content: string;
  private position = 0;
  private open = true;

  constructor(
    private readonly directory: FakeDirectory,
    private readonly fileName: string,
    initial: string,
  ) {
    this.content = initial;
  }

  private assertOpen(): void {
    if (!this.open) {
      throw new TypeError("writable is closed");
    }
  }

  async seek(position: number): Promise<void> {
    this.assertOpen();
    this.directory.guard();
    this.position = position;
  }

  async write(data: string): Promise<void> {
    this.assertOpen();
    this.directory.guard();
    const before = this.content.slice(0, this.position);
    const after = this.content.slice(this.position + data.length);
    this.content = before + data + after;
    this.position += data.length;
  }

  async close(): Promise<void> {
    this.assertOpen();
    this.directory.guard();
    this.open = false;
    this.directory.files.set(this.fileName, this.content);
    this.directory.commits += 1;
  }

  async abort(): Promise<void> {
    this.open = false;
  }
}
