export function Button({ children, variant = "primary", size = "medium" }) {
    const baseClasses = "button font-medium transition-all duration-200";
    const variantClasses = {
        primary: "bg-blue-600 hover:bg-blue-700 text-white",
        secondary: "bg-gray-600 hover:bg-gray-700 text-white",
        outline: "border-2 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white",
    };
    const sizeClasses = {
        small: "px-3 py-1.5 text-sm",
        medium: "px-4 py-2 text-base",
        large: "px-6 py-3 text-lg",
    };

    const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]}`;

    return <button className={classes}>{children}</button>;
}
