export class ApiError extends Error {
  readonly status: number;
  readonly auditId: string | null;

  constructor(status: number, message: string, auditId: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.auditId = auditId;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
