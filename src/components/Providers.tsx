"use client";

import { GridStoreProvider } from "./GridStore";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <GridStoreProvider>{children}</GridStoreProvider>;
}
