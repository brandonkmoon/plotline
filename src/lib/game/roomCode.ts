export const VALID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += VALID_CHARS[Math.floor(Math.random() * VALID_CHARS.length)];
  }
  return code;
}

export function generateUniqueRoomCode(existingCodes: string[]): string {
  const codeSet = new Set(existingCodes);
  let code = generateRoomCode();
  while (codeSet.has(code)) {
    code = generateRoomCode();
  }
  return code;
}
