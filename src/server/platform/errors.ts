export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The request is well-formed but asks for something the server will not do. */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

/** A dependency the request needs is not available right now. */
export class UnavailableError extends AppError {
  constructor(message: string) {
    super(message, 503);
  }
}

/** The LLM provider failed. The message is safe to show to the user. */
export class ProviderError extends AppError {
  constructor(message: string) {
    super(message, 502);
  }
}
