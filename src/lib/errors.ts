export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown, code = "BAD_REQUEST") => new AppError(400, code, message, details);
export const unauthorized = (message = "Autentikasi diperlukan.", code = "UNAUTHENTICATED") => new AppError(401, code, message);
export const forbidden = (message = "Anda tidak memiliki izin untuk tindakan ini.", code = "FORBIDDEN") => new AppError(403, code, message);
export const notFound = (message = "Data tidak ditemukan.") => new AppError(404, "NOT_FOUND", message);
export const conflict = (code: string, message: string, details?: unknown) => new AppError(409, code, message, details);
export const tooMany = (message: string, retryAfterSeconds: number) =>
  new AppError(429, "RATE_LIMITED", message, { retryAfterSeconds });
