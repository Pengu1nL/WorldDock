import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodValidationPipe } from "./zod-validation.pipe";

describe("ZodValidationPipe", () => {
  it("parses request values with a provided Zod schema", () => {
    const pipe = new ZodValidationPipe();

    const parsed = pipe.transform(
      { limit: "25" },
      {
        type: "query",
        metatype: undefined,
        data: undefined,
        schema: z.object({ limit: z.coerce.number().int().min(1).max(50) }),
      },
    );

    expect(parsed).toEqual({ limit: 25 });
  });

  it("throws BadRequestException with VALIDATION_FAILED for invalid values", () => {
    const pipe = new ZodValidationPipe();

    expect(() =>
      pipe.transform(
        { limit: "0" },
        {
          type: "query",
          metatype: undefined,
          data: undefined,
          schema: z.object({ limit: z.coerce.number().int().min(1) }),
        },
      ),
    ).toThrow(BadRequestException);
  });
});
