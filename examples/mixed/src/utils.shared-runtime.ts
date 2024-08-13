export function test1() {
  if (process.env.NODE_ENV === 'development') {
    console.log('test1 from shared utils');
  }

  return 'test1';
}

export function test2() {
  if (process.env.NODE_ENV === 'development') {
    console.log('test2 from shared utils');
  }

  return 'test2';
}

export type Test = 'foo';
