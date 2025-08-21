export function Header({ title, subtitle }) {
    return (
        <header className="header bg-gradient-to-r from-blue-900 to-blue-700 text-white">
            <div className="header-container">
                <h1 className="header-title text-3xl font-bold">
                    {title}
                </h1>
                {subtitle && (
                    <p className="header-subtitle text-blue-100 text-lg">
                        {subtitle}
                    </p>
                )}
            </div>
        </header>
    );
}
