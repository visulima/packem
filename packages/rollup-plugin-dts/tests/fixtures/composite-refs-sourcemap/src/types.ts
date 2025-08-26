export type Toast = {
    description?: string;
    duration?: number;
    notificationId?: string;
    title: string;
    type: "info" | "success" | "error" | "warning";
};
export const sharedValue = 1;
