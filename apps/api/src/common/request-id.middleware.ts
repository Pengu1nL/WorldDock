import { Injectable, type NestMiddleware } from "@nestjs/common";
import { createRequestId, readIncomingRequestId, requestIdHeader, type RequestWithRequestId } from "./request-id";

type ResponseWithHeader = {
  header?: (name: string, value: string) => void;
  setHeader?: (name: string, value: string) => void;
};

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithRequestId, response: ResponseWithHeader, next: () => void) {
    const requestId = readIncomingRequestId(request) ?? createRequestId();
    request.requestId = requestId;

    if (typeof response.header === "function") {
      response.header(requestIdHeader, requestId);
    } else {
      response.setHeader?.(requestIdHeader, requestId);
    }

    next();
  }
}
