import { NEXT_TEST_STATUSES, type NextTestStatus } from '../domain/types.ts';

export class S10ValidationError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'S10ValidationError';
  }
}

export class S10NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = 'S10NotFoundError';
  }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validUuid(value: string): boolean { return UUID.test(value); }


export type NextTestInput = {
  variableToTest: unknown;
  variantA: unknown;
  variantB: unknown;
  controls: unknown;
  expectedResult: unknown;
  owner: unknown;
  successMetric: unknown;
  measurementWindow: unknown;
  targetBatchId?: unknown;
};

export type NextTestPatch = Partial<NextTestInput> & { status?: unknown };

export type NoteInput = { body: unknown; author: unknown };

export function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new S10ValidationError(`${field} is required`);
  return value.trim();
}

export function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredText(value, field);
}

export function validStatus(value: unknown): NextTestStatus {
  if (typeof value !== 'string' || !(NEXT_TEST_STATUSES as readonly string[]).includes(value)) throw new S10ValidationError(`status must be one of ${NEXT_TEST_STATUSES.join('|')}`);
  return value as NextTestStatus;
}

export function validateNoteInput(input: NoteInput): { body: string; author: string } {
  return { body: requiredText(input.body, 'body'), author: requiredText(input.author, 'author') };
}

export function validateNextTestInput(input: NextTestInput): {
  variableToTest: string; variantA: string; variantB: string; controls: string; expectedResult: string; owner: string; successMetric: string; measurementWindow: string; targetBatchId?: string;
} {
  const targetBatchId = input.targetBatchId === undefined ? undefined : requiredText(input.targetBatchId, 'targetBatchId');
  if (targetBatchId !== undefined && !validUuid(targetBatchId)) throw new S10ValidationError('targetBatchId must be a valid UUID');
  return {
    variableToTest: requiredText(input.variableToTest, 'variableToTest'),
    variantA: requiredText(input.variantA, 'variantA'),
    variantB: requiredText(input.variantB, 'variantB'),
    controls: requiredText(input.controls, 'controls'),
    expectedResult: requiredText(input.expectedResult, 'expectedResult'),
    owner: requiredText(input.owner, 'owner'),
    successMetric: requiredText(input.successMetric, 'successMetric'),
    measurementWindow: requiredText(input.measurementWindow, 'measurementWindow'),
    targetBatchId,
  };
}

export function validateNextTestPatch(input: NextTestPatch): Record<string, string> & { status?: NextTestStatus } {
  const patch: Record<string, string> & { status?: NextTestStatus } = {};
  for (const [key, field] of [['variableToTest', 'variableToTest'], ['variantA', 'variantA'], ['variantB', 'variantB'], ['controls', 'controls'], ['expectedResult', 'expectedResult'], ['owner', 'owner'], ['successMetric', 'successMetric'], ['measurementWindow', 'measurementWindow'], ['targetBatchId', 'targetBatchId']] as const) {
    const value = optionalText(input[key], field);
    if (value !== undefined) {
      if (key === 'targetBatchId' && !validUuid(value)) throw new S10ValidationError('targetBatchId must be a valid UUID');
      patch[key] = value;
    }
  }
  if (input.status !== undefined) patch.status = validStatus(input.status);
  if (Object.keys(patch).length === 0) throw new S10ValidationError('at least one Next Test field is required');
  return patch;
}
