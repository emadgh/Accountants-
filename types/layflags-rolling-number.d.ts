import type * as React from 'react';

declare module '@layflags/rolling-number';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'layflags-rolling-number': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        value?: string | number;
      };
    }
  }
}
