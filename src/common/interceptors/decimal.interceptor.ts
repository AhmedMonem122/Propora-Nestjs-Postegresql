import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable, map } from 'rxjs';

/**
 * Prisma returns money columns as Decimal objects, which JSON-serialize to
 * strings ("1500.00"). APIs should speak numbers, so every Decimal in an
 * outgoing response is converted to a plain number here — in one place,
 * instead of sprinkling `.toNumber()` across services.
 */
@Injectable()
export class DecimalInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map((data) => convertDecimals(data)));
  }
}

function convertDecimals(value: unknown): unknown {
  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }
  if (Array.isArray(value)) {
    return value.map(convertDecimals);
  }
  // Plain objects only: class instances (Date, Buffer, …) must pass
  // through untouched — rebuilding them would destroy their behavior.
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = convertDecimals(entry);
    }
    return out;
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
