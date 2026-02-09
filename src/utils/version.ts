export const compareVersions = (a: string, b: string): number => {
  const partsA = a.split(".").map((value) => Number(value));
  const partsB = b.split(".").map((value) => Number(value));
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
};

export const isValidVersion = (version: string): boolean => {
  return /^\d+\.\d+\.\d+$/.test(version);
};
