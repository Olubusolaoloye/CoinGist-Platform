export type DomainErrorKind = "forbidden" | "not_found" | "conflict" | "invalid";

export class DomainError extends Error {
  constructor(
    readonly kind: DomainErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** Translate Postgres error codes raised by our policies/functions into domain errors. */
export function mapDbError(err: unknown): never {
  const e = err as { code?: string; message?: string };
  const message = e.message ?? "database error";
  switch (e.code) {
    case "42501": // insufficient_privilege (RLS / grants / our explicit checks)
      throw new DomainError("forbidden", message);
    case "P0002": // no_data_found
      throw new DomainError("not_found", message);
    case "P0001": // raise_exception (business rule)
    case "23505": // unique_violation
      throw new DomainError("conflict", message);
    case "22023": // invalid_parameter_value
    case "22P02": // invalid_text_representation
    case "23514": // check_violation
      throw new DomainError("invalid", message);
    default:
      throw err;
  }
}
