"use client";

import { GridStoreProvider } from "./GridStore";
import { LatticeSourceProvider } from "./lattice/latticeSource";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GridStoreProvider>
      <LatticeSourceProvider>{children}</LatticeSourceProvider>
    </GridStoreProvider>
  );
}
