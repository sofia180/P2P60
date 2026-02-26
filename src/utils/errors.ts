export class HttpError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const wrapAsync =
  (fn: (req: any, res: any, next: any) => Promise<void>) =>
  (req: any, res: any, next: any) => {
    fn(req, res, next).catch(next);
  };
