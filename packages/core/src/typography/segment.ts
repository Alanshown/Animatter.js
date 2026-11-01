export function segmentText(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new (Intl as unknown as {
      Segmenter: new (locale: string, options: { granularity: string }) => {
        segment(input: string): Iterable<{ segment: string }>;
      };
    }).Segmenter("und", { granularity: "grapheme" });
    return [...segmenter.segment(text)].map((s) => s.segment);
  }
  // Fallback for old engines: code points keep surrogate pairs intact but not combining marks.
  return Array.from(text);
}
