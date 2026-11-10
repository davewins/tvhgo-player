// Broadcasters tag programme titles with notes such as "New: Lingo" or "Final: Lingo". The tag is not part of the
// programme's name, so a show's recordings are grouped under the title without it. Only these known tags are removed;
// "DIY SOS: The Big Build" is a real title. (The same list is in core/title.go on the server.)
const TAG =
  /^(new series|new|final|last in series|last|returns|return|premiere)\s*:\s*/i;

export function cleanTitle(title: string): string {
  let t = title.trim();
  for (let i = 0; i < 2; i++) {
    const stripped = t.replace(TAG, '').trim();
    if (stripped === t || stripped === '') {
      break;
    }
    t = stripped;
  }
  return t;
}
