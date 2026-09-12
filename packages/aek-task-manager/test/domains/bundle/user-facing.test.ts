import { describe, expect, it } from 'vitest';
import {
  buildSkillCreatorInstallText,
  buildSkillCreatorPlanSummary,
  buildSkillCreatorResumeText,
  formatSkillCreatorPlanSummary,
} from '../../../domains/bundle/user-facing.js';

describe('Skill Creator user-facing summaries', () => {
  it('formats a Comet-based workflow contract', () => {
    const summary = buildSkillCreatorPlanSummary({
      intent: 'customize-comet',
      skillName: 'team-comet',
      goal: 'Use project component and review Skills inside the Comet workflow.',
      workflow: {
        kind: 'comet-five-phase-overlay',
        outputSchemas: ['comet.plan.v1', 'comet.execution-evidence.v1'],
        nodes: [
          {
            id: 'execute',
            label: 'Execute',
            kind: 'control',
            implementationSkill: 'comet-build',
            requiredSkills: ['elementui'],
            outputSchemas: ['comet.execution-evidence.v1'],
          },
          {
            id: 'review',
            label: 'Review',
            kind: 'guardrail',
            implementationSkill: 'requesting-code-review',
            requiredSkills: ['whitebox-code-standard'],
            outputSchemas: ['comet.review.v1'],
          },
        ],
      },
      retained: [],
      additions: ['execute: comet-build', 'review: requesting-code-review'],
      replacements: [],
      disabled: [],
      rejected: [],
      generated: ['Skill files, rules, hooks, scripts'],
      validation: ['Quick validation is recommended before install'],
      install: ['Install/enable into the current Agent after preview'],
      advanced: ['Workflow Contract hash will be recorded after confirmation'],
    });

    const text = formatSkillCreatorPlanSummary(summary);

    expect(text).toContain('You are making: Customize existing Comet Skills');
    expect(text).toContain('Workflow contract:');
    expect(text).toContain('Node execute: Execute; control; implementation: comet-build');
    expect(text).toContain('required Skill calls: elementui');
    expect(text).toContain('Output Schemas: comet.plan.v1, comet.execution-evidence.v1');
  });

  it('formats resume text around user progress and next action', () => {
    const text = buildSkillCreatorResumeText({
      title: 'Found an unfinished Skill creation',
      completed: ['Plan confirmed', 'Skill files generated'],
      missing: ['Validate this Skill'],
      nextAction: 'Continue validation',
      choices: ['Continue', 'View details', 'Abandon this creation'],
    });

    expect(text).toContain('Found an unfinished Skill creation');
    expect(text).toContain('Completed:');
    expect(text).toContain('Still needed:');
    expect(text).toContain('Next step: Continue validation');
    expect(text).not.toContain('Skill Creator state is draft');
  });

  it('formats install preview without forcing publish/distribute vocabulary', () => {
    const text = buildSkillCreatorInstallText({
      preview: true,
      skillName: 'team-comet',
      platforms: ['claude'],
      plannedFiles: ['skill: .claude/skills/team-comet/SKILL.md', 'hook: before-tool'],
      disclosures: ['hook guard reads state before writes'],
    });

    expect(text).toContain('Install preview');
    expect(text).toContain('No files were written');
    expect(text).toContain('Planned files:');
    expect(text).toContain('Executable disclosures:');
    expect(text).not.toContain('Distribution preview');
  });
});
