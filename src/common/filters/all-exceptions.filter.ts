import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  requestId?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : this.extractPrismaStatus(exception);

    const body: ErrorResponse = {
      statusCode: status,
      message:
        exception instanceof HttpException
          ? exception.getResponse() instanceof Object
            ? ((exception.getResponse() as { message?: string | string[] }).message ??
              exception.message)
            : exception.message
          : 'Internal server error',
      error: this.extractErrorName(exception, status),
      timestamp: new Date().toISOString(),
      path: request?.url ?? '',
    };

    if (request?.requestId) {
      body.requestId = request.requestId;
    }

    if (status >= 500) {
      this.logger.error(
        `${request?.method ?? ''} ${request?.url ?? ''} - ${(exception as Error)?.message ?? exception}`,
        (exception as Error)?.stack,
      );
    }

    response.status(status).json(body);
  }

  private extractPrismaStatus(exception: unknown): number {
    const code = (exception as { code?: string })?.code;
    if (!code) {
      return 500;
    }
    switch (code) {
      case 'P2002':
        return 409;
      case 'P2025':
        return 404;
      case 'P2003':
        return 409;
      default:
        return 500;
    }
  }

  private extractErrorName(exception: unknown, status: number): string {
    if (exception instanceof HttpException) {
      return exception.name ?? 'HttpException';
    }
    if ((exception as { code?: string })?.code === 'P2002') {
      return 'UniqueConstraintViolation';
    }
    if ((exception as { code?: string })?.code === 'P2025') {
      return 'RecordNotFound';
    }
    return status >= 500 ? 'InternalServerError' : 'Error';
  }
}
