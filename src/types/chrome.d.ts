declare namespace chrome {
  export namespace storage {
    export interface StorageArea {
      get(keys?: string | string[] | null): Promise<{ [key: string]: any }>;
      set(items: { [key: string]: any }): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
      getBytesInUse(keys?: string | string[] | null): Promise<number>;
    }

    export const local: StorageArea & {
      QUOTA_BYTES: number;
    };
    export const sync: StorageArea;
  }

  export namespace runtime {
    export interface Port {
      name: string;
      disconnect(): void;
      onDisconnect: events.Event;
      onMessage: events.Event;
      postMessage: (message: any) => void;
    }

    export interface MessageSender {
      id?: string;
      tab?: chrome.tabs.Tab;
      frameId?: number;
      url?: string;
      origin?: string;
    }

    export interface ConnectInfo {
      name?: string;
    }

    export type MessageCallback = (
      message: any,
      sender: MessageSender,
      sendResponse: (response?: any) => void
    ) => void | boolean;

    export const onMessage: {
      addListener(callback: MessageCallback): void;
      removeListener(callback: MessageCallback): void;
      hasListeners(): boolean;
    };

    export function connect(connectInfo?: ConnectInfo): Port;
    export function connect(extensionId: string, connectInfo?: ConnectInfo): Port;
    export function sendMessage(message: any): Promise<any>;
    export function sendMessage(message: any, options: any): Promise<any>;
    export function sendMessage(extensionId: string, message: any): Promise<any>;
  }

  export namespace tabs {
    export interface Tab {
      id?: number;
      index: number;
      windowId: number;
      highlighted: boolean;
      active: boolean;
      pinned: boolean;
      url?: string;
      title?: string;
      favIconUrl?: string;
      status?: string;
      incognito: boolean;
      width?: number;
      height?: number;
      sessionId?: string;
    }

    export function query(queryInfo: {
      active?: boolean;
      currentWindow?: boolean;
      [key: string]: any;
    }): Promise<Tab[]>;

    export function sendMessage(tabId: number, message: any): Promise<any>;
    export function sendMessage(tabId: number, message: any, options?: any): Promise<any>;
  }

  export namespace scripting {
    export interface InjectionTarget {
      tabId: number;
      frameIds?: number[];
      allFrames?: boolean;
    }

    export interface ScriptInjection extends InjectionTarget {
      files?: string[];
      code?: string;
    }

    export function executeScript(injection: ScriptInjection): Promise<any[]>;
  }

  export namespace events {
    export interface Event {
      addListener(callback: Function): void;
      removeListener(callback: Function): void;
      hasListener(callback: Function): boolean;
    }
  }
} 