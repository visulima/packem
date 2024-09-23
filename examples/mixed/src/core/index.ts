import {test1, test2, Test} from '../utils.shared-runtime';

export function core() {
  if (process.env.NODE_ENV === 'development') {
    console.log('core function called');
  }

  return 'core' + test1() + test2();
}

export const foo: Test = 'foo';
