import { z } from "zod";

export const repoPathSegmentSchema = z.string().min(1).superRefine((value, context) => {
  if (value.trim().length === 0) {
    context.addIssue({
      code: "custom",
      message: "Repository path segment must not be blank.",
    });
  }
  if (value === "." || value === "..") {
    context.addIssue({
      code: "custom",
      message: "Repository path segment must not be dot or dot-dot.",
    });
  }
  if (value.includes("/") || value.includes("\\")) {
    context.addIssue({
      code: "custom",
      message: "Repository path segment must not contain slashes.",
    });
  }
});
