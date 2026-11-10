import { expect, test } from 'vitest';

import { cleanTitle } from './title';

test.each([
  ['New: Lingo', 'Lingo'],
  ['NEW: Lingo', 'Lingo'],
  ['New Series: Lingo', 'Lingo'],
  ['Final: Lingo', 'Lingo'],
  ['Last in Series: Lingo', 'Lingo'],
  ['New: Final: Lingo', 'Lingo'],
  ['Lingo', 'Lingo'],
  ['DIY SOS: The Big Build', 'DIY SOS: The Big Build'],
  ['Newsnight', 'Newsnight'],
  ['  New:   Pointless  ', 'Pointless'],
])('cleanTitle(%j) = %j', (input, want) => {
  expect(cleanTitle(input)).toBe(want);
});
