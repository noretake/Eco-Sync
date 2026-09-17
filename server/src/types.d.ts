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
