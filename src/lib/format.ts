export const formatMMK = (value: number) => `${Math.round(value).toLocaleString("en-US")} MMK`;
export const titleCase = (value: string) => value.split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
