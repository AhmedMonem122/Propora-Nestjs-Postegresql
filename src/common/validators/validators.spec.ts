import { describe, expect, it } from 'vitest';
import { isPhoneNumberValid } from './phone.validator.js';
import { isEgyptianNationalIdValid } from './national-id.validator.js';

describe('isPhoneNumberValid (libphonenumber)', () => {
  it.each([
    '+201001234567',
    '+20 100 123 4567',
    '01001234567', // national format via EG default
    '+442071234567',
    '+12125551234',
  ])('accepts %s', (value) => {
    expect(isPhoneNumberValid(value)).toBe(true);
  });

  it.each(['abc', '123', '+20', '++201001234567', '', '0700'])(
    'rejects %s',
    (value) => {
      expect(isPhoneNumberValid(value)).toBe(false);
    },
  );

  it('rejects non-strings', () => {
    expect(isPhoneNumberValid(null)).toBe(false);
    expect(isPhoneNumberValid(undefined)).toBe(false);
    expect(isPhoneNumberValid(123)).toBe(false);
  });
});

describe('isEgyptianNationalIdValid', () => {
  it.each([
    '29901011234567', // 1999-01-01
    '30002291234567', // 2000-02-29 (2000 was a leap year)
    '28512311234567', // 1985-12-31
  ])('accepts %s', (value) => {
    expect(isEgyptianNationalIdValid(value)).toBe(true);
  });

  it.each([
    '19901011234567', // bad century digit
    '49901011234567', // bad century digit
    '29913011234567', // month 13
    '29902301234567', // Feb 30
    '20102291234567', // 1901-02-29 (1901 not a leap year)
    '29901011', // too short
    '299010112345678', // too long
    '2990101ABCDEFG', // non-digits
  ])('rejects %s', (value) => {
    expect(isEgyptianNationalIdValid(value)).toBe(false);
  });

  it('rejects future birthdates', () => {
    const nextYear = (new Date().getFullYear() + 1).toString().slice(2);
    expect(isEgyptianNationalIdValid(`3${nextYear}0101123456`)).toBe(false);
  });
});
