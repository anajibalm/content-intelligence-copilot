const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function operationIdFromRequest(input: Record<string, unknown>, header: string | null): unknown {
  return input.operationId ?? header ?? undefined;
}

export function validOperationId(value: unknown): value is string {
  return value === undefined || (typeof value === 'string' && UUID.test(value));
}
