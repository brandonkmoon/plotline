export function normalizeLocation(input: string): string {
  let s = input.trim().replace(/[.!?,;:]+$/, '');
  if (!s) return "somewhere";
  const prepRegex = /^(in|at|on|under|over|inside|outside|near|beside|behind|between|beneath|above|around|through)\s/i;
  const match = s.match(prepRegex);
  if (match) {
    // Lowercase just the preposition, keep the rest
    s = match[1].toLowerCase() + s.slice(match[1].length);
  } else {
    s = "in " + s.charAt(0).toLowerCase() + s.slice(1);
  }
  return s;
}

export function normalizeAction(input: string): string {
  let s = input.trim().replace(/[.!?,;:]+$/, '');
  if (!s) return "doing something mysterious";
  s = s.charAt(0).toLowerCase() + s.slice(1);
  return s;
}

export function normalizeDialogue(input: string): string {
  let s = input.trim();
  if (!s) return "...";
  // Strip surrounding quotes
  s = s.replace(/^["'\u2018\u2019\u201C\u201D]+/, '').replace(/["'\u2018\u2019\u201C\u201D]+$/, '');
  // Ensure ends with sentence punctuation
  if (!/[.!?]$/.test(s)) {
    s += ".";
  }
  return s;
}

export function normalizeEnding(input: string): string {
  let s = input.trim().replace(/[.!?,;:]+$/, '');
  if (!s) return "nothing happened";
  s = s.charAt(0).toLowerCase() + s.slice(1);
  return s;
}
