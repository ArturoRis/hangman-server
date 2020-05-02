export class SocketResp<R = string> {
  constructor(
    public ok: boolean,
    public data: R,
  ) {
  }
}

export function createOkResp<R>(data: R) {
  return new SocketResp(true, data);
}

export function createErrorResp<R>(data: R) {
  return new SocketResp(false, data);
}
