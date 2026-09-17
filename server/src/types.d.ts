declare module "imapflow" {
  export class ImapFlow {
    constructor(options: any);
    connect(): Promise<void>;
    getMailboxLock(name: string): Promise<{ release(): void }>;
    fetch(query: any, options: any): AsyncIterable<any>;
  }
}
declare module "mailparser" {
  export function simpleParser(source: any): Promise<any>;
}
declare module "supertest" {
  const request: any;
  export default request;
}
declare module "whatsapp-web.js" {
  export class LocalAuth {
    constructor(options: { dataPath: string });
  }
  export class Client {
    constructor(options: any);
    info?: { wid?: { user?: string } };
    on(event: string, listener: (...args: any[]) => void): this;
    initialize(): Promise<void>;
    getChats(): Promise<Chat[]>;
    logout(): Promise<void>;
    destroy(): Promise<void>;
  }
  export class Chat {
    id: { _serialized: string };
    name: string;
    isGroup: boolean;
    fetchMessages(options: { limit: number }): Promise<Message[]>;
  }
  export class Message {
    id: { _serialized: string };
    type: string;
    body: string;
    hasMedia: boolean;
    timestamp: number;
    fromMe: boolean;
    getChat(): Promise<Chat>;
    getContact(): Promise<{ pushname?: string; number: string }>;
    reply(body: string): Promise<unknown>;
  }
}
