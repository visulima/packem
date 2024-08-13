import {test1, test2} from '../utils.shared-runtime';

export function react() {
  if (process.env.NODE_ENV === 'development') {
    console.log('react function called');
  }

  return 'react' + test1() + test2();
}
