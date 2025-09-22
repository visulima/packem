import "./Footer.css";

export function Footer({ links = [] }) {
    return (
        <footer className="footer bg-gray-900 text-white py-12">
            <div className="footer-container">
                <div className="footer-content">
                    <p className="footer-copyright text-gray-400">© 2024 Tailwind Oxide Test. All rights reserved.</p>
                    {links.length > 0 && (
                        <nav className="footer-nav">
                            <ul className="footer-links">
                                {links.map((link, index) => (
                                    <li key={index} className="footer-link-item">
                                        <a href={link.href} className="footer-link">
                                            {link.text}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    )}
                </div>
            </div>
        </footer>
    );
}
