const getPackageName = (id = ""): string => {
    const s = id.split("/");

    return ((s[0] as string).startsWith("@") ? (s[0] as string) + "/" + (s[1] as string) : s[0]) as string;
};

export default getPackageName;
