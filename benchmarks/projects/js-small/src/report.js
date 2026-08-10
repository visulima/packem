const currency = new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" });

export const formatReport = ({ items, total }) =>
    [...items.map((item) => `${item.name}: ${currency.format(item.price)}`), `total: ${currency.format(total)}`].join("\n");
