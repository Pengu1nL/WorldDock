import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type PiSkillDescriptor = {
  name: string;
  path: string;
  description: string;
  instructions?: string;
};

export type SessionPiSkillKind =
  | "world_exploration"
  | "asset_edit"
  | "consistency_repair";

export type SessionPiSkillIntent = "asset_deposition";

type LoadSessionPiSkillsBaseInput = {
  skillsDir?: string;
};

export type LoadSessionPiSkillsInput =
  | (LoadSessionPiSkillsBaseInput & {
      kind: "world_exploration";
      intent?: SessionPiSkillIntent;
    })
  | (LoadSessionPiSkillsBaseInput & {
      kind: "asset_edit";
      intent?: never;
    })
  | (LoadSessionPiSkillsBaseInput & {
      kind: "consistency_repair";
      intent?: never;
    });

const DEFAULT_PI_SKILLS_DIR = "apps/api/src/modules/agent/pi/skills";
const LOCAL_PI_SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "skills");

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
} satisfies Record<string, Omit<PiSkillDescriptor, "path" | "instructions">>;

type SessionSkillName = keyof typeof SESSION_SKILLS;

export function loadSessionPiSkills(input: LoadSessionPiSkillsInput): PiSkillDescriptor[] {
  const name = selectSessionSkillName(input);
  const skill = SESSION_SKILLS[name];
  const basePath = input.skillsDir ?? DEFAULT_PI_SKILLS_DIR;
  const skillPath = `${basePath}/${skill.name}`;
  const instructions = input.skillsDir
    ? readSkillInstructions(skillPath)
    : readFirstSkillInstructions(getDefaultSkillInstructionPaths(skill.name));

  return [{
    ...skill,
    path: skillPath,
    ...(instructions ? { instructions } : {}),
  }];
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

function readSkillInstructions(skillPath: string): string | undefined {
  try {
    const instructions = readFileSync(join(skillPath, "SKILL.md"), "utf8").trim();
    return instructions.length > 0 ? instructions : undefined;
  } catch {
    return undefined;
  }
}

function readFirstSkillInstructions(skillPaths: string[]): string | undefined {
  for (const skillPath of skillPaths) {
    const instructions = readSkillInstructions(skillPath);
    if (instructions) {
      return instructions;
    }
  }

  return undefined;
}

function getDefaultSkillInstructionPaths(skillName: string): string[] {
  return [
    join(LOCAL_PI_SKILLS_DIR, skillName),
    join(process.cwd(), DEFAULT_PI_SKILLS_DIR, skillName),
    join(process.cwd(), "src/modules/agent/pi/skills", skillName),
  ];
}
