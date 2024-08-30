/// <reference types="react/experimental" />

'use client';

import { useActionState } from 'react';
import { request } from './server-components/request';

export function UsernameForm() {
  const [state, action] = useActionState(request, null, 'n/a');

  return (
    <>
      <form action={action}>
        <input type="text" name="username" />
        <button type="submit">Request</button>
      </form>
      <p>Last submission request returned: {state.name}</p>
    </>
  );
}
