/** Saves the portable export as a file download (Settings > Data transfer, Sync). */
export async function downloadPortableExport(): Promise<void> {
  const dataDocument = await window.api.exportPortableData();
  const url = URL.createObjectURL(
    new Blob([dataDocument], { type: "application/json;charset=utf-8" }),
  );
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `budgie-export-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
