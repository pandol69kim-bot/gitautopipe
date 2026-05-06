interface CronFieldSpec {
  min: number;
  max: number;
}

const CRON_FIELD_SPECS: CronFieldSpec[] = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 7 },
];

export function validateCronExpression(expression: string): void {
  parseCronExpression(expression);
}

export function isCronDue(expression: string, date: Date): boolean {
  const fields = parseCronExpression(expression);
  const values = [
    date.getMinutes(),
    date.getHours(),
    date.getDate(),
    date.getMonth() + 1,
    date.getDay(),
  ];

  return fields.every((field, index) => matchesField(field, values[index], CRON_FIELD_SPECS[index]));
}

function parseCronExpression(expression: string): string[] {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error('cron 표현식은 5개 필드(min hour day month dayOfWeek)여야 합니다.');
  }

  fields.forEach((field, index) => {
    parseField(field, CRON_FIELD_SPECS[index]);
  });

  return fields;
}

function matchesField(field: string, value: number, spec: CronFieldSpec): boolean {
  const candidates = spec.max === 7 && value === 0 ? [0, 7] : [value];

  return parseField(field, spec).some((range) =>
    candidates.some(
      (candidate) =>
        candidate >= range.start &&
        candidate <= range.end &&
        (candidate - range.start) % range.step === 0
    )
  );
}

function parseField(field: string, spec: CronFieldSpec): Array<{ start: number; end: number; step: number }> {
  const tokens = field.split(',').map((token) => token.trim()).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    throw new Error(`빈 cron 필드는 허용되지 않습니다: ${field}`);
  }

  return tokens.map((token) => parseToken(token, spec));
}

function parseToken(token: string, spec: CronFieldSpec): { start: number; end: number; step: number } {
  const [base, stepRaw] = token.split('/');
  if (!base) {
    throw new Error(`잘못된 cron 토큰입니다: ${token}`);
  }

  const step = stepRaw ? parseInteger(stepRaw, `잘못된 step 값입니다: ${token}`) : 1;
  if (step <= 0) {
    throw new Error(`step은 1 이상이어야 합니다: ${token}`);
  }

  if (base === '*') {
    return { start: spec.min, end: spec.max, step };
  }

  if (base.includes('-')) {
    const [startRaw, endRaw] = base.split('-');
    const start = parseBoundedInteger(startRaw, spec, token);
    const end = parseBoundedInteger(endRaw, spec, token);
    if (start > end) {
      throw new Error(`cron 범위 시작값이 종료값보다 클 수 없습니다: ${token}`);
    }

    return { start, end, step };
  }

  const exact = parseBoundedInteger(base, spec, token);
  return { start: exact, end: exact, step: 1 };
}

function parseBoundedInteger(raw: string | undefined, spec: CronFieldSpec, token: string): number {
  const value = parseInteger(raw, `잘못된 숫자 토큰입니다: ${token}`);
  if (value < spec.min || value > spec.max) {
    throw new Error(`cron 값이 허용 범위를 벗어났습니다: ${token}`);
  }

  return value;
}

function parseInteger(raw: string | undefined, message: string): number {
  const value = Number.parseInt(raw ?? '', 10);
  if (Number.isNaN(value)) {
    throw new Error(message);
  }

  return value;
}