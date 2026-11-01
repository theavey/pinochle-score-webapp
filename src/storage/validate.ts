/**
 * Tiny runtime validators for data that crosses a trust boundary (localStorage
 * and imported backup files). Each validator returns a freshly built value
 * containing only known fields, so unexpected keys (including `__proto__`)
 * are dropped rather than carried along.
 */

export class ValidationError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path || 'value'}: ${message}`);
  }
}

export type Validator<T> = (value: unknown, path: string) => T;

export const str =
  (opts: { min?: number; max: number }): Validator<string> =>
  (v, path) => {
    if (typeof v !== 'string') throw new ValidationError(path, 'expected text');
    if (v.length < (opts.min ?? 0)) throw new ValidationError(path, 'too short');
    if (v.length > opts.max) throw new ValidationError(path, 'too long');
    return v;
  };

export const int =
  (opts: { min: number; max: number }): Validator<number> =>
  (v, path) => {
    if (typeof v !== 'number' || !Number.isSafeInteger(v)) {
      throw new ValidationError(path, 'expected a whole number');
    }
    if (v < opts.min || v > opts.max) throw new ValidationError(path, 'out of range');
    return v;
  };

export const bool: Validator<boolean> = (v, path) => {
  if (typeof v !== 'boolean') throw new ValidationError(path, 'expected true/false');
  return v;
};

export const oneOf =
  <const T extends readonly (string | number)[]>(...values: T): Validator<T[number]> =>
  (v, path) => {
    if (!values.includes(v as T[number])) throw new ValidationError(path, 'unexpected value');
    return v as T[number];
  };

export const nullable =
  <T>(inner: Validator<T>): Validator<T | null> =>
  (v, path) =>
    v === null || v === undefined ? null : inner(v, path);

export const arr =
  <T>(item: Validator<T>, opts: { max: number }): Validator<T[]> =>
  (v, path) => {
    if (!Array.isArray(v)) throw new ValidationError(path, 'expected a list');
    if (v.length > opts.max) throw new ValidationError(path, 'too many items');
    return v.map((x, i) => item(x, `${path}[${i}]`));
  };

export const tuple2 =
  <T>(item: Validator<T>): Validator<[T, T]> =>
  (v, path) => {
    if (!Array.isArray(v) || v.length !== 2) throw new ValidationError(path, 'expected 2 items');
    return [item(v[0], `${path}[0]`), item(v[1], `${path}[1]`)];
  };

export const tuple4 =
  <T>(item: Validator<T>): Validator<[T, T, T, T]> =>
  (v, path) => {
    if (!Array.isArray(v) || v.length !== 4) throw new ValidationError(path, 'expected 4 items');
    return [
      item(v[0], `${path}[0]`),
      item(v[1], `${path}[1]`),
      item(v[2], `${path}[2]`),
      item(v[3], `${path}[3]`),
    ];
  };

type Shape = Record<string, Validator<unknown>>;
type FromShape<S extends Shape> = { [K in keyof S]: ReturnType<S[K]> };

export const obj =
  <S extends Shape>(shape: S): Validator<FromShape<S>> =>
  (v, path) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new ValidationError(path, 'expected an object');
    }
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(shape)) {
      const validator = shape[key];
      if (!validator) continue;
      const value = Object.prototype.hasOwnProperty.call(src, key) ? src[key] : undefined;
      out[key] = validator(value, path ? `${path}.${key}` : key);
    }
    return out as FromShape<S>;
  };
