import { formatReport } from "./report.js";
import { createStore } from "./store.js";

const store = createStore({ items: [], total: 0 });

store.dispatch({ payload: { name: "widget", price: 9.99 }, type: "add" });
store.dispatch({ payload: { name: "gadget", price: 24.5 }, type: "add" });

export const report = formatReport(store.getState());
export { createStore, formatReport };
