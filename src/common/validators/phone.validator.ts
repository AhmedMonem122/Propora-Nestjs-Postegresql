import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { parsePhoneNumber, type CountryCode } from 'libphonenumber-js';

/**
 * Default country for national-format numbers (no leading `+`).
 * Override with PHONE_DEFAULT_COUNTRY (ISO alpha-2, e.g. `EG`, `SA`).
 */
export function defaultPhoneCountry(): CountryCode {
  const raw = (process.env.PHONE_DEFAULT_COUNTRY ?? 'EG')
    .trim()
    .toUpperCase();
  return (raw.length === 2 ? raw : 'EG') as CountryCode;
}

/**
 * True when libphonenumber (Google's phone library) parses the value and
 * considers it a valid, dialable number. International format (`+20…`)
 * always works; national format is interpreted via defaultPhoneCountry().
 */
export function isPhoneNumberValid(value: unknown): boolean {
  if (typeof value !== 'string' || value.trim() === '') {
    return false;
  }
  try {
    return parsePhoneNumber(value, defaultPhoneCountry()).isValid();
  } catch {
    return false;
  }
}

export function IsPhoneNumber(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPhoneNumber',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          // Null/undefined are @IsOptional's job; only validate content.
          if (value === null || value === undefined) {
            return true;
          }
          return isPhoneNumberValid(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid phone number (e.g. +201001234567)`;
        },
      },
    });
  };
}
