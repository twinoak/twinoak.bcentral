// Ambient types for the parts of the File System Access API that lib.dom does not ship
// (P1-04): the directory picker and the permission methods on a handle. The handle and
// stream types themselves (FileSystemDirectoryHandle, FileSystemFileHandle,
// FileSystemWritableFileStream) are in lib.dom. Chromium only; feature-detect with
// `"showDirectoryPicker" in window` before use.

type FileSystemPermissionMode = "read" | "readwrite";

interface FileSystemHandlePermissionDescriptor {
  mode?: FileSystemPermissionMode;
}

interface FileSystemHandle {
  // "granted" while the browser lets the page use the handle; "prompt" after a restart (the
  // handle survives in IndexedDB, the permission does not) until requestPermission() is
  // called from a user gesture.
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface DirectoryPickerOptions {
  // Lets the browser remember the last folder picked under this id.
  id?: string;
  mode?: FileSystemPermissionMode;
  startIn?:
    FileSystemHandle | "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
