const reduce = (state, action) => {
    switch (action.type) {
        case "add": {
            const items = [...state.items, action.payload];

            return { items, total: items.reduce((sum, item) => sum + item.price, 0) };
        }
        case "clear": {
            return { items: [], total: 0 };
        }
        default: {
            return state;
        }
    }
};

export const createStore = (initialState) => {
    let state = initialState;

    return {
        dispatch(action) {
            state = reduce(state, action);

            return state;
        },
        getState() {
            return state;
        },
    };
};
