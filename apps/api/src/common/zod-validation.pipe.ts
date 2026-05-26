import { BadRequestException, Injectable, type ArgumentMetadata, type PipeTransform } from "@nestjs/common";
import { type ZodType, ZodError } from "zod";

export type ZodArgumentMetadata = ArgumentMetadata & {
  schema?: ZodType;
};

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ZodArgumentMetadata) {
    if (!metadata.schema) return value;

    const result = metadata.schema.safeParse(value);
    if (result.success) return result.data;

    throw new BadRequestException({
      code: "VALIDATION_FAILED",
      message: "Request validation failed.",
      details: this.formatIssues(result.error),
    });
  }

  private formatIssues(error: ZodError) {
    return error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
  }
}
