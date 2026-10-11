// "next/og" is an extensionless specifier plain node can't resolve. This points
// at the exact image engine Next ships, so card code runs here as in production.
export { ImageResponse } from "next/dist/compiled/@vercel/og/index.node.js";
