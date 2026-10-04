import { badRequest } from './errors.js';

/**
 * 小さな入力検証ヘルパー。エラーを集めて最後に 400 を投げる。
 */
export class Validator {
  constructor(input) {
    this.input = input && typeof input === 'object' ? input : {};
    this.errors = {};
  }

  string(key, { required = false, max = 1000, pattern, message } = {}) {
    const raw = this.input[key];
    if (raw === undefined || raw === null || raw === '') {
      if (required) this.errors[key] = '必須項目です';
      return required ? undefined : '';
    }
    if (typeof raw !== 'string') {
      this.errors[key] = '文字列で指定してください';
      return undefined;
    }
    const value = raw.trim();
    if (required && value === '') this.errors[key] = '必須項目です';
    else if (value.length > max) this.errors[key] = `${max} 文字以内で入力してください`;
    else if (pattern && value !== '' && !pattern.test(value)) this.errors[key] = message ?? '形式が正しくありません';
    return value;
  }

  integer(key, { required = false, min, max } = {}) {
    const raw = this.input[key];
    if (raw === undefined || raw === null || raw === '') {
      if (required) this.errors[key] = '必須項目です';
      return undefined;
    }
    const value = typeof raw === 'string' ? Number(raw) : raw;
    if (!Number.isInteger(value)) {
      this.errors[key] = '整数で指定してください';
      return undefined;
    }
    if (min !== undefined && value < min) this.errors[key] = `${min} 以上で指定してください`;
    if (max !== undefined && value > max) this.errors[key] = `${max} 以下で指定してください`;
    return value;
  }

  boolean(key, { defaultValue = false } = {}) {
    const raw = this.input[key];
    if (raw === undefined || raw === null) return defaultValue;
    if (typeof raw !== 'boolean') {
      this.errors[key] = 'true / false で指定してください';
      return defaultValue;
    }
    return raw;
  }

  addError(key, message) {
    this.errors[key] = message;
  }

  assertValid() {
    if (Object.keys(this.errors).length > 0) {
      throw badRequest('入力内容に誤りがあります', this.errors);
    }
  }
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const POSTAL_CODE_PATTERN = /^\d{3}-?\d{4}$/;
export const PHONE_PATTERN = /^[0-9+\-() ]{10,20}$/;
