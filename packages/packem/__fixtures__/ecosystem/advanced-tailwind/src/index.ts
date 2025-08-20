// Import the advanced Tailwind CSS styles
import "./styles.css";

// Export a simple component interface for testing
export interface AdvancedTailwindComponent {
    name: string;
    className: string;
    description: string;
}

export const components: AdvancedTailwindComponent[] = [
    {
        name: "Primary Button",
        className: "btn-primary",
        description: "A primary button with hover effects and transitions",
    },
    {
        name: "Card",
        className: "card",
        description: "A card component with shadow and border styling",
    },
    {
        name: "Gradient Text",
        className: "text-gradient",
        description: "Text with blue to purple gradient effect",
    },
];

export function getComponent(
    name: string,
): AdvancedTailwindComponent | undefined {
    return components.find((comp) => comp.name === name);
}

export function getAllComponents(): AdvancedTailwindComponent[] {
    return components;
}
