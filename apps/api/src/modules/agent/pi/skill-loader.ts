import { loadSessionPiSkills, type PiSkillDescriptor } from "./session-skill-loader";

export type { PiSkillDescriptor } from "./session-skill-loader";

export function loadWorldDockPiSkills(env: { PI_SKILLS_DIR?: string } = {}): PiSkillDescriptor[] {
  return [
    loadSessionPiSkills({
      kind: "world_exploration",
      skillsDir: env.PI_SKILLS_DIR,
    }),
  ];
}

export function loadPiSkills(skillsDir?: string): PiSkillDescriptor[] {
  return loadWorldDockPiSkills({ PI_SKILLS_DIR: skillsDir });
}
