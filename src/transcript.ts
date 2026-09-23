const TOOL_NOTATION = [
  /\[\s*play[\s_]+(?:the[\s_]+)?avatar(?:[\s_]+animation)?\s*[:=][^\]]*\]/gi,
  /\(\s*play_avatar_animation\s*(?:with\s+)?[^)]*\)/gi,
  /play_avatar_animation\s*\([^)]*\)/gi,
];

const ANIMATION_NARRATION = [
  /(^|\n)\s*(?:i(?:'|’)ll|i\s+will|let\s+me|vou|irei|deixe[- ]?me|agora\s+vou)[^\n.!?]*(?:animation|gesture|visual\s+confirmation|animaç(?:ão|ao)|gesto|confirmaç(?:ão|ao)\s+visual)[^\n.!?]*[.!?]?/gim,
  /(^|\n)\s*(?:done|completed|pronto|feito|conclu[ií]do)[^\n.!?]*(?:animation|gesture|visual\s+confirmation|animaç(?:ão|ao)|gesto|confirmaç(?:ão|ao)\s+visual)[^\n.!?]*[.!?]?/gim,
];

export function sanitizeAssistantTranscript(value: string): string {
  let cleaned = value;
  for (const pattern of TOOL_NOTATION) cleaned = cleaned.replace(pattern, "");
  for (const pattern of ANIMATION_NARRATION) cleaned = cleaned.replace(pattern, "$1");
  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}
