import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from "@nestjs/common";
import { apiErrorSchema, type ApiError } from "@worlddock/domain";
import { getRequestId, type RequestWithRequestId } from "./request-id";

type ErrorResponse = {
  code?: string;
  message?: string | string[];
  details?: unknown;
};

type HttpResponse = {
  code?: (statusCode: number) => HttpResponse;
  status?: (statusCode: number) => HttpResponse;
  send: (body: unknown) => void;
};

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithRequestId>();
    const response = context.getResponse<HttpResponse>();
    const payload = this.toApiError(exception, getRequestId(request));
    const status = this.getStatus(exception);

    if (typeof response.code === "function") {
      response.code(status).send(payload);
      return;
    }

    response.status?.(status).send(payload);
  }

  private getStatus(exception: unknown): number {
    if (exception instanceof HttpException) return exception.getStatus();
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private toApiError(exception: unknown, requestId: string): ApiError {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const normalized = typeof response === "string"
        ? { message: response }
        : response as ErrorResponse;

      return apiErrorSchema.parse({
        code: normalized.code ?? this.defaultCodeForStatus(exception.getStatus()),
        message: this.normalizeMessage(normalized.message ?? exception.message),
        requestId,
        details: normalized.details,
      });
    }

    return apiErrorSchema.parse({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error.",
      requestId,
    });
  }

  private normalizeMessage(message: string | string[]): string {
    return Array.isArray(message) ? message.join("; ") : message;
  }

  private defaultCodeForStatus(status: number): string {
    if (status === HttpStatus.BAD_REQUEST) return "BAD_REQUEST";
    if (status === HttpStatus.UNAUTHORIZED) return "AUTH_REQUIRED";
    if (status === HttpStatus.FORBIDDEN) return "PERMISSION_DENIED";
    if (status === HttpStatus.NOT_FOUND) return "NOT_FOUND";
    if (status === HttpStatus.SERVICE_UNAVAILABLE) return "SERVICE_UNAVAILABLE";
    return "HTTP_ERROR";
  }
}
