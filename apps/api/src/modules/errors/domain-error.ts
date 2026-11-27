/** Extra machine-readable fields that are safe to return to the client. */
export interface DomainErrorExtras {
  current_total?: string;
  product_ids?: string[];
}

export class DomainError extends Error {
  readonly code: string;
  readonly status: number;
  readonly extras: DomainErrorExtras;

  constructor(
    code: string,
    message: string,
    status: number,
    extras: DomainErrorExtras = {}
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
    this.extras = extras;
  }
}
