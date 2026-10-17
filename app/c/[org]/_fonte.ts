/** A serifa dos títulos da área do cliente; as classes que a usam estão em `_tema.ts`. */
import { Fraunces } from "next/font/google";

export const serifDaArea = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-area-serif",
  axes: ["SOFT", "opsz"],
});
