import rsc from './rsc';

export function index() {
  if (process.env.NODE_ENV === 'development') {
    console.log('index function called');
  }

  return rsc;
}
