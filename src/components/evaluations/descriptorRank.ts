export const DESCRIPTOR_RANK_STORAGE_KEY = "vul-descriptor-ranks";

export type DescriptorRankSnapshot = {
  version: string;
  forms: Array<{
    slotId: string;
    meshId: string;
    filename: string;
    descriptors: Record<string, { absoluteScore: number; comparativeRank?: number }>;
  }>;
};

export type RankComponent = {
  name: string;
  raw?: number;
  weight: number;
};

export type RankDescriptor = {
  id: string;
  absoluteScore: number;
  components: RankComponent[];
  comparativeRank?: number;
  relativeRank?: number;
  relativePercentile?: number;
  cohortSize?: number;
  tieBreakUsed?: boolean;
};

/**
 * Unique comparative ranks. 15 is the strongest expression in the current set.
 * Order: full-precision absolute score, then raw components by descending weight,
 * then stable form id. The absolute score is never changed to break a tie.
 */
export function assignComparativeRanks<T extends { formId: string; descriptors: RankDescriptor[] }>(forms: T[]) {
  const count = forms.length;
  if (!count) return forms;
  const ids = forms[0].descriptors.map((descriptor) => descriptor.id);
  for (const id of ids) {
    const rows = forms.map((form, index) => {
      const descriptor = form.descriptors.find((item) => item.id === id);
      const components = [...(descriptor?.components ?? [])]
        .filter((component) => component.weight > 0)
        .sort((left, right) => right.weight - left.weight || left.name.localeCompare(right.name));
      return {
        index,
        formId: form.formId,
        absolute: descriptor?.absoluteScore ?? 0,
        components,
      };
    });
    rows.sort((left, right) => {
      if (left.absolute !== right.absolute) return left.absolute - right.absolute;
      const limit = Math.max(left.components.length, right.components.length);
      for (let index = 0; index < limit; index += 1) {
        const leftRaw = left.components[index]?.raw ?? 0;
        const rightRaw = right.components[index]?.raw ?? 0;
        if (leftRaw !== rightRaw) return leftRaw - rightRaw;
      }
      if (left.formId < right.formId) return -1;
      if (left.formId > right.formId) return 1;
      return left.index - right.index;
    });
    const sameMetrics = (left: (typeof rows)[number], right: (typeof rows)[number]) => {
      if (left.absolute !== right.absolute || left.components.length !== right.components.length) return false;
      return left.components.every((component, index) => (component.raw ?? 0) === (right.components[index]?.raw ?? 0));
    };
    rows.forEach((row, position) => {
      const descriptor = forms[row.index].descriptors.find((item) => item.id === id);
      if (!descriptor) return;
      const rank = position + 1;
      descriptor.comparativeRank = rank;
      descriptor.relativeRank = rank;
      descriptor.cohortSize = count;
      descriptor.relativePercentile = count === 1 ? 100 : Math.round(((rank - 1) / (count - 1)) * 100);
      descriptor.tieBreakUsed = rows.some((other) => other.index !== row.index && sameMetrics(other, row));
    });
  }
  return forms;
}
