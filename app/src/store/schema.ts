// The contract schema compiled once with ajv. Every write to the journal store goes through
// one of these validators (tasks/CONVENTIONS.md); a failure throws ValidationError and nothing
// is stored.

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { ErrorObject, ValidateFunction } from "ajv";
import schema from "../../../contract/journal.schema.json";
import type { Envelope, Incident, JournalEntry, RegisterEntry } from "./types.ts";

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
ajv.addSchema(schema);

function compileRef<T>(ref: string): ValidateFunction<T> {
  return ajv.compile<T>({ $ref: ref });
}

export const validateEnvelope = compileRef<Envelope>(schema.$id);
export const validateIncident = compileRef<Incident>(`${schema.$id}#/$defs/incident`);
export const validateRegisterEntry = compileRef<RegisterEntry>(`${schema.$id}#/$defs/registerEntry`);
export const validateJournalEntry = compileRef<JournalEntry>(`${schema.$id}#/$defs/journalEntry`);

export class ValidationError extends Error {
  readonly errors: readonly ErrorObject[];

  constructor(what: string, errors: readonly ErrorObject[]) {
    super(
      `${what} does not match contract/journal.schema.json: ${ajv.errorsText([...errors], { dataVar: what })}`,
    );
    this.name = "ValidationError";
    this.errors = errors;
  }
}

export function assertValid<T>(
  validate: ValidateFunction<T>,
  data: unknown,
  what: string,
): asserts data is T {
  if (!validate(data)) {
    throw new ValidationError(what, validate.errors ?? []);
  }
}
