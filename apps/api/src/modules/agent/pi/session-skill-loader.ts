export type PiSkillDescriptor = {
  name: string;
  path: string;
  description: string;
};

export type SessionPiSkillKind =
  | "world_exploration"
  | "asset_edit"
  | "consistency_repair";

export type SessionPiSkillIntent = "asset_deposition";

export type LoadSessionPiSkillsInput = {
  kind: SessionPiSkillKind;
  intent?: SessionPiSkillIntent;
  skillsDir?: string;
};

const DEFAULT_PI_SKILLS_DIR = "apps/api/src/modules/agent/pi/skills";

const SESSION_SKILLS = {
  "world-exploration": {
    name: "world-exploration",
    description: "Discuss and analyze world exploration without creating formal assets.",
  },
  "asset-deposition": {
    name: "asset-deposition",
    description: "Create one formal asset from a selected potential asset or explicit user text.",
  },
  "asset-edit": {
    name: "asset-edit",
    description: "Edit only the bound asset Markdown and output a patch.",
  },
  "consistency-repair": {
    name: "consistency-repair",
    description: "Generate a repair patch batch for the bound issue and related assets.",
  },
} satisfies Record<string, Omit<PiSkillDescriptor, "path">>;

type SessionSkillName = keyof typeof SESSION_SKILLS;

export function loadSessionPiSkills(input: LoadSessionPiSkillsInput): PiSkillDescriptor {
  const name = selectSessionSkillName(input);
  const skill = SESSION_SKILLS[name];
  const basePath = input.skillsDir ?? DEFAULT_PI_SKILLS_DIR;

  return {
    ...skill,
    path: `${basePath}/${skill.name}`,
  };
}

function selectSessionSkillName(input: LoadSessionPiSkillsInput): SessionSkillName {
  if (input.kind === "world_exploration" && input.intent === "asset_deposition") {
    return "asset-deposition";
  }

  if (input.kind === "asset_edit") {
    return "asset-edit";
  }

  if (input.kind === "consistency_repair") {
    return "consistency-repair";
  }

  return "world-exploration";
}
