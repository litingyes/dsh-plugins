/**
 * The embedded skill: metadata here, the craft itself in `skill.md`.
 *
 * The body is Markdown read from the package at mount time instead of being
 * inlined in JavaScript, so it stays reviewable and diffable like a document.
 * `skill.md` is listed in the package's `files`.
 *
 * @module @litingyes/dsh-director/skill
 */

import { readFileSync } from 'node:fs'

/** Skill name used by the model-facing skill catalog. */
export const SKILL_NAME = 'ai-video-direction'

/** One-paragraph catalog description; this is what makes the model load it. */
export const SKILL_DESCRIPTION =
  'Direct an AI-generated short film from idea to paste-ready prompts: logline, beat sheet, scene and shot list, positive/negative prompt and parameters for Kling/Jimeng/Hailuo (可灵/即梦/海螺), audio-visual plan and take log, kept as workspace files. Use when the user wants to make an AI video, or asks about story structure, storyboarding, shot design, sound design, or how to write prompts for AI video products.'

/** Longer routing hint shown beside the description. */
export const SKILL_WHEN_TO_USE =
  'When the user describes a video idea, a script or a storyboard, reports generated clips, or asks how to organize plot, shots, voice-over/music/sound effects, or how to write prompts for AI video products. It does not generate video: the deliverable is the prompt sheet and the production plan.'

/**
 * Read the skill body from the package.
 *
 * @returns {string} Markdown instructions.
 * @throws {Error} when the file is missing or empty, which means the package
 *   was installed without `skill.md` and the skill would be useless.
 */
export function loadSkillContent() {
  const url = new URL('./skill.md', import.meta.url)
  let content
  try {
    content = readFileSync(url, 'utf8')
  } catch (error) {
    throw new Error(
      `dsh-director: cannot read skill.md from the package (${error instanceof Error ? error.message : String(error)}); reinstall the plugin`,
    )
  }
  if (content.trim() === '') {
    throw new Error('dsh-director: skill.md is empty; reinstall the plugin')
  }
  return content
}

/**
 * The object `ctx.skills.register` accepts.
 *
 * @returns {{ name: string, description: string, whenToUse: string, content: string }} skill.
 */
export function skillDefinition() {
  return {
    name: SKILL_NAME,
    description: SKILL_DESCRIPTION,
    whenToUse: SKILL_WHEN_TO_USE,
    content: loadSkillContent(),
  }
}
