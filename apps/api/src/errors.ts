export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export function ensure(
  condition: unknown,
  status: number,
  message: string,
  details?: unknown,
): asserts condition {
  if (!condition) throw new AppError(status, message, details);
}
