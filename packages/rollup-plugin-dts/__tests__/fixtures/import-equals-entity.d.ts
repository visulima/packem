declare namespace NS {
    interface Inner {
        value: number;
    }
}

import Aliased = NS.Inner;

export { Aliased };
