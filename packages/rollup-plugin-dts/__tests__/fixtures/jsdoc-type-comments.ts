export const foo = 'foo';

interface A {
  /** Comment A1 */
  AA?: string;
  /** Comment A2 */
  AB?: string;
  /** Comment A3 */
  AC?: string;
}

type B = {
  /** Comment B1 */
  BA?: string;
  /** Comment B2 */
  BB?: string;
  /** Comment B3 */
  BC?: string;
};

export function something() {
  const a: A = {};
  const b: B = {};
  return { a, b };
}

export function fn(): void {
  something();
  return;
}
