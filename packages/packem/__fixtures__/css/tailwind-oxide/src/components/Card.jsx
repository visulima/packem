export function Card({ title, children, variant = "default" }) {
    const baseClasses = "card rounded-xl shadow-lg";
    const variantClasses = {
        default: "bg-white border border-gray-200",
        elevated: "bg-white shadow-2xl transform hover:scale-105",
        outlined: "bg-transparent border-2 border-gray-300",
    };

    const classes = `${baseClasses} ${variantClasses[variant]}`;

    return (
        <div className={classes}>
            {title && <h3 className="text-xl font-semibold text-gray-800 mb-3">{title}</h3>}
            <div className="text-gray-600">{children}</div>
        </div>
    );
}
