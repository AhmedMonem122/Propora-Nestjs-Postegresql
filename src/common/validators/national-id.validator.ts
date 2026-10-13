import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Egyptian national ID structure: 14 digits —
 * `[century 2|3][YYMMDD birthdate][serial 6][check 1]`.
 *
 * Validates shape + a real calendar birthdate (incl. leap years and
 * "not born in the future"), not just length. No checksum is enforced:
 * the check-digit algorithm is not publicly standardized, and a wrong one
 * would reject legitimate IDs.
 */
export function isEgyptianNationalIdValid(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  if (!/^\d{14}$/.test(value)) {
    return false;
  }

  const centuryDigit = Number(value[0]);
  if (centuryDigit !== 2 && centuryDigit !== 3) {
    return false;
  }

  const fullYear =
    (centuryDigit === 2 ? 1900 : 2000) + Number(value.slice(1, 3));
  const month = Number(value.slice(3, 5));
  const day = Number(value.slice(5, 7));

  if (month < 1 || month > 12) {
    return false;
  }
  const leap =
    (fullYear % 4 === 0 && fullYear % 100 !== 0) || fullYear % 400 === 0;
  const daysInMonth = [
    31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
  ][month - 1];
  if (day < 1 || day > daysInMonth) {
    return false;
  }
  if (fullYear > new Date().getFullYear()) {
    return false;
  }

  return true;
}

export function IsEgyptianNationalId(
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isEgyptianNationalId',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === null || value === undefined) {
            return true;
          }
          return isEgyptianNationalIdValid(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid 14-digit Egyptian national ID`;
        },
      },
    });
  };
}
