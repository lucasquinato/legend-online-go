
const families = [
  [1011003, 1012003, 1013003],
  [1041003, 1042003, 1043003],
];
/** Only the recovered starter set is translated; other loot retains its own class. */
export function starterTemplate(template: number, job: number): number {
  return (
    families.find((group) => group.includes(template))?.[job - 1] ?? template
  );
}
