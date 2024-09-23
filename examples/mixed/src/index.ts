export * from './core';
export * from './react';

export function index() {
  if (process.env.NODE_ENV === 'development') {
    console.log('index function called');
  }

  return 'index';
}
