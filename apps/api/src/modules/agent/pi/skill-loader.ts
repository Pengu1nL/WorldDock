export type PiSkillDescriptor = {
  name: string;
  path: string;
  description: string;
};

export function loadWorldDockPiSkills(env: { PI_SKILLS_DIR?: string }): PiSkillDescriptor[] {
  const basePath = env.PI_SKILLS_DIR ?? "apps/api/src/modules/agent/pi/skills";
  return [
    {
      name: "world-context",
      path: `${basePath}/world-context`,
      description: "Use WorldDock progressive disclosure: Manifest, Cards, Briefs, Details, then Source Fragments.",
    },
    {
      name: "world-suggestion",
      path: `${basePath}/world-suggestion`,
      description: "Create typed pending suggestions instead of writing product data directly.",
    },
  ];
}

export function loadPiSkills(skillsDir?: string): PiSkillDescriptor[] {
  return loadWorldDockPiSkills({ PI_SKILLS_DIR: skillsDir });
}
