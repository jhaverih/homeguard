import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { NotificationsService, NotificationType } from '../../notifications/notifications.service';

// A repeatedly-failing endpoint (e.g. a bad deploy, a dependency outage)
// would otherwise fire one admin notification per request — this collapses
// that to one per key per window. In-memory and reset on redeploy is
// intentional for a first pass: no new DB table, no cross-instance
// coordination needed for a single-API-instance deployment like this one.
const ADMIN_ALERT_DEDUP_WINDOW_MS = 10 * 60 * 1000;

// Catches everything that reaches Nest's exception handling — the goal is
// proactive visibility into real 5xx errors (the vendor-capabilities crash
// and today's other incidents were both only discovered when a user hit
// them and reported it) without changing what clients receive. HttpException
// responses are passed through completely unchanged; only genuine unhandled
// errors get the generic message, matching Nest's own default behavior for
// those but now also logged and surfaced to admins.
@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly lastAlertedAt = new Map<string, number>();

  constructor(private notificationsService: NotificationsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    // HttpException bodies (thrown by our own code, e.g. BadRequestException)
    // are already safe to return as-is — they're deliberately constructed
    // error messages. A raw uncaught error (a DB constraint violation, a
    // null-pointer, etc.) is never returned verbatim to the client — only
    // Nest's own generic message, so internal details never leak over the
    // wire.
    const body = isHttpException
      ? exception.getResponse()
      : { statusCode: status, message: 'Internal server error' };

    if (status >= 500) {
      const key = `${request.method} ${request.originalUrl ?? request.url}`;
      const errorMessage = (exception as any)?.message ?? String(exception);
      this.logger.error(`Unhandled exception on ${key}: ${errorMessage}`, (exception as any)?.stack);

      const now = Date.now();
      const lastAlert = this.lastAlertedAt.get(key) ?? 0;
      if (now - lastAlert > ADMIN_ALERT_DEDUP_WINDOW_MS) {
        this.lastAlertedAt.set(key, now);
        this.notificationsService.notifyAdmins(
          NotificationType.UNHANDLED_EXCEPTION,
          'Server Error',
          `${key} failed with a server error: ${errorMessage}`,
          { path: request.originalUrl ?? request.url, method: request.method },
        ).catch(() => {});
      }
    }

    response.status(status).json(body);
  }
}
