import { Inject, Injectable } from "@nestjs/common";

export const DEPENDENCY_HEALTH_CHECKERS = Symbol("DEPENDENCY_HEALTH_CHECKERS");

export type DependencyHealthChecker = {
  name: string;
  check: () => Promise<void>;
};

export type DependencyReadiness = {
  name: string;
  status: "ok" | "error";
};

@Injectable()
export class ReadinessService {
  constructor(
    @Inject(DEPENDENCY_HEALTH_CHECKERS)
    private readonly checkers: DependencyHealthChecker[],
  ) {}

  async check() {
    const dependencies = await Promise.all(
      this.checkers.map(async (checker): Promise<DependencyReadiness> => {
        try {
          await checker.check();
          return { name: checker.name, status: "ok" };
        } catch {
          return { name: checker.name, status: "error" };
        }
      }),
    );

    return {
      ready: dependencies.every((dependency) => dependency.status === "ok"),
      dependencies,
    };
  }
}
