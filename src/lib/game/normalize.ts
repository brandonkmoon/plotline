/**
 * Extract just the player name from a round 0/1 response.
 * Responses may be "Dave — a retired sword swallower" or just "Dave".
 * Returns the part before the em dash (or en dash, or " - ").
 */
export function extractName(nameResponse: string): string {
  for (const sep of [" \u2014 ", " \u2013 ", " - "]) {
    const idx = nameResponse.indexOf(sep);
    if (idx !== -1) return nameResponse.slice(0, idx).trim();
  }
  return nameResponse.trim();
}

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

/**
 * Build a story card title from the two character names and the raw location
 * response. Format: "Name1 & Name2 in [location]", truncated to ~60 chars.
 *
 * We work from the raw location input (before normalizeLocation prepends "in ")
 * so we can control the preposition ourselves.
 */
export function generateStoryTitle(
  name1: string,
  name2: string,
  rawLocation: string,
  maxLocationChars = 40
): string {
  const names = `${name1} & ${name2}`;

  // Strip trailing punctuation, then handle the preposition
  let loc = rawLocation.trim().replace(/[.!?,;:]+$/, '');
  if (!loc) return names;

  const prepRegex = /^(in|at|on|under|over|inside|outside|near|beside|behind|between|beneath|above|around|through)\s/i;
  const match = loc.match(prepRegex);
  if (!match) {
    // No preposition written — add "in"
    loc = "in " + loc.charAt(0).toUpperCase() + loc.slice(1);
  } else {
    // Keep the preposition but capitalize what follows
    const prep = match[1].toLowerCase();
    const rest = loc.slice(match[1].length).trim();
    loc = prep + " " + rest.charAt(0).toUpperCase() + rest.slice(1);
  }

  // Truncate the location portion if it's too long
  if (loc.length > maxLocationChars) {
    loc = loc.slice(0, maxLocationChars).trimEnd() + "…";
  }

  return `${names} ${loc}`;
}
